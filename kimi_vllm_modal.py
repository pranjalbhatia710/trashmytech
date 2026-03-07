"""
kimi_vllm_modal.py — Production Modal deployment for Kimi K2.5 via vLLM

Serves moonshotai/Kimi-K2.5 (1T MoE, 32B active) as an OpenAI-compatible
API endpoint on Modal. Uses vLLM nightly (required for kimi_k2 parser).

GPU requirements for the full BF16 model:
  - 8x H200 (141GB each, ~1.1TB total)  ← official recommendation
  - 8x H100  (80GB each, ~640GB)         ← tight; reduce max-model-len
  - For fewer GPUs, use nvidia/Kimi-K2.5-NVFP4 (FP4 quantized)

Usage:
  # Pre-download weights (recommended, avoids cold-start timeout):
  modal run kimi_vllm_modal.py::download_model

  # Deploy:
  modal deploy kimi_vllm_modal.py

  # Dev mode (hot reload, ephemeral):
  modal serve kimi_vllm_modal.py
"""

import os
import subprocess

import modal

# ---------------------------------------------------------------------------
# Configuration — change these to adjust the deployment
# ---------------------------------------------------------------------------

# Model
MODEL: str = "moonshotai/Kimi-K2.5"
MAX_MODEL_LEN: int = 32768
GPU_MEMORY_UTILIZATION: float = 0.92

# GPU — Kimi K2.5 full BF16 needs 8x H100/H200 minimum
GPU_TYPE: str = "H100"
GPU_COUNT: int = 8  # tensor-parallel size matches GPU count by default

# Concurrency & timeouts (seconds)
MAX_CONCURRENT_INPUTS: int = 50
CONTAINER_TIMEOUT: int = 60 * 60       # 60 min max request lifetime
STARTUP_TIMEOUT: int = 30 * 60         # 30 min for download + CUDA graph build
SCALEDOWN_WINDOW: int = 15 * 60        # 15 min idle → scale to zero

# Server
VLLM_PORT: int = 8000

# ---------------------------------------------------------------------------
# Modal resources
# ---------------------------------------------------------------------------

app = modal.App("kimi-k2-vllm")

hf_cache = modal.Volume.from_name("hf-cache-kimi", create_if_missing=True)
vllm_cache = modal.Volume.from_name("vllm-cache-kimi", create_if_missing=True)

# ---------------------------------------------------------------------------
# Container image
#
# vLLM nightly is required — the kimi_k2 reasoning/tool-call parsers
# shipped after the last stable release.
# ---------------------------------------------------------------------------

vllm_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "huggingface_hub[hf_transfer]",
        "hf-transfer",
        "transformers>=4.57.1",
    )
    .run_commands(
        "pip install vllm"
        " --extra-index-url https://wheels.vllm.ai/nightly"
    )
    .env({
        "HF_HUB_ENABLE_HF_TRANSFER": "1",
        "VLLM_CONFIGURE_LOGGING": "1",
    })
)

# ---------------------------------------------------------------------------
# Lightweight image just for downloading weights
# ---------------------------------------------------------------------------

download_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("huggingface_hub[hf_transfer]", "hf-transfer")
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
)

# ---------------------------------------------------------------------------
# vLLM OpenAI-compatible server
# ---------------------------------------------------------------------------


@app.function(
    image=vllm_image,
    gpu=f"{GPU_TYPE}:{GPU_COUNT}",
    secrets=[
        modal.Secret.from_name("kimi-vllm-secrets"),  # HF_TOKEN + optional API_BEARER_TOKEN
    ],
    timeout=CONTAINER_TIMEOUT,
    scaledown_window=SCALEDOWN_WINDOW,
    volumes={
        "/root/.cache/huggingface": hf_cache,
        "/root/.cache/vllm": vllm_cache,
    },
)
@modal.concurrent(max_inputs=MAX_CONCURRENT_INPUTS)
@modal.web_server(port=VLLM_PORT, startup_timeout=STARTUP_TIMEOUT)
def serve():
    """Launch vLLM as a subprocess. Modal routes HTTP traffic to VLLM_PORT."""

    # Allow runtime overrides via Modal Secret env vars
    model = os.environ.get("MODEL", MODEL)
    max_len = os.environ.get("MAX_MODEL_LEN", str(MAX_MODEL_LEN))
    tp = os.environ.get("TP", str(GPU_COUNT))
    gpu_mem = os.environ.get("GPU_MEM_UTIL", str(GPU_MEMORY_UTILIZATION))

    cmd = [
        "vllm", "serve", model,
        "--host", "0.0.0.0",
        "--port", str(VLLM_PORT),
        "--tensor-parallel-size", tp,
        "--max-model-len", max_len,
        "--gpu-memory-utilization", gpu_mem,
        "--trust-remote-code",
        "--mm-encoder-tp-mode", "data",         # required for Kimi K2.5 vision encoder
        "--reasoning-parser", "kimi_k2",        # thinking mode support
        "--tool-call-parser", "kimi_k2",        # tool calling support
        "--served-model-name", model,
        "--uvicorn-log-level", "info",
        "--enforce-eager",                       # skip CUDA graphs → faster cold start
    ]

    # If API_BEARER_TOKEN is set, vLLM enforces `Authorization: Bearer <token>`
    # on every request. If unset, endpoints are open.
    api_key = os.environ.get("API_BEARER_TOKEN")
    if api_key:
        cmd.extend(["--api-key", api_key])

    print(f"[kimi-vllm] Launching: {' '.join(cmd)}")
    subprocess.Popen(cmd)


# ---------------------------------------------------------------------------
# Pre-download weights (run once to warm the volume)
# ---------------------------------------------------------------------------


@app.function(
    image=download_image,
    secrets=[modal.Secret.from_name("kimi-vllm-secrets")],
    volumes={"/root/.cache/huggingface": hf_cache},
    timeout=60 * 60,
)
def download_model(model_id: str = MODEL):
    """Download model weights into the persistent HF cache volume.

    Usage:  modal run kimi_vllm_modal.py::download_model
    """
    from huggingface_hub import snapshot_download

    print(f"[kimi-vllm] Downloading {model_id} …")
    snapshot_download(
        repo_id=model_id,
        ignore_patterns=["*.md", "*.txt", "docs/*"],
    )
    print(f"[kimi-vllm] Done — {model_id} cached in volume")

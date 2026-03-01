"use client";

import React from "react";

/**
 * Animated grid counter that counts 0-9 with sliding blocks.
 * Themed to match trashmy.tech dark/red aesthetic.
 */
export default function CounterLoader({ color = "#ef4444" }: { color?: string }) {
  return (
    <>
      <style jsx>{`
        .counter-grid {
          display: grid;
          grid-template-columns: repeat(3, 20px);
          grid-template-rows: repeat(5, 20px);
          gap: 6px;
        }
        .counter-grid > div {
          background-color: ${color};
          border-radius: 4px;
          box-shadow: 0 0 8px ${color}40;
        }
        .cg1 { animation: cg1 10s both infinite; }
        .cg2 { animation: cg2 10s both infinite; }
        .cg4 { animation: cg4 10s both infinite; }
        .cg6 { animation: cg6 10s both infinite; }
        .cg7 { animation: cg7 10s both infinite; }
        .cg8 { animation: cg8 10s both infinite; }
        .cg10 { animation: cg10 10s both infinite; }
        .cg12 { animation: cg12 10s both infinite; }
        .cg13 { animation: cg13 10s both infinite; }
        .cg14 { animation: cg14 10s both infinite; }
        .cg-hide { display: none; }

        @keyframes cg1 {
          0%,20%,30%,40%,50%,60%,70%,80%,90%,100% { transform: translateX(0); }
          10% { transform: translateX(52px); }
        }
        @keyframes cg2 {
          0%,20%,30%,50%,60%,70%,80%,90%,100% { transform: translateX(0); }
          10%{ transform: translateX(26px); }
          40%{ transform: translateX(26px); }
        }
        @keyframes cg4 {
          0%,50%,60% { transform: translateX(0); }
          10%,20%,30% { transform: translateX(52px); }
          40% { transform: translateX(0); }
          70% { transform: translateX(52px); }
          80%,90%,100% { transform: translateX(0); }
        }
        @keyframes cg6 {
          0%,10%,20%,30%,40%,70%,80%,90%,100% { transform: translateX(0); }
          50%,60% { transform: translateX(-52px); }
        }
        @keyframes cg7 {
          0%,20%,30%,40%,50%,60%,80%,90%,100% { transform: translateX(0); }
          10% { transform: translateX(52px); }
          70% { transform: translateX(52px); }
        }
        @keyframes cg8 {
          0% { transform: translateX(26px); }
          10% { transform: translateX(26px); }
          20%,30%,40%,50%,60% { transform: translateX(0); }
          70% { transform: translateX(26px); }
          80%,90% { transform: translateX(0); }
          100% { transform: translateX(26px); }
        }
        @keyframes cg10 {
          0%,60% { transform: translateX(0); }
          10%,20% { transform: translateX(52px); }
          30%,40%,50% { transform: translateX(52px); }
          70% { transform: translateX(52px); }
          80% { transform: translateX(0); }
          90% { transform: translateX(52px); }
          100% { transform: translateX(0); }
        }
        @keyframes cg12 {
          0%,10%,30%,40%,50%,60%,70%,80%,90%,100% { transform: translateX(0); }
          20% { transform: translateX(-52px); }
        }
        @keyframes cg13 {
          0%,20%,30%,50%,60%,80%,90%,100% { transform: translateX(0); }
          10% { transform: translateX(52px); }
          40% { transform: translateX(52px); }
          70% { transform: translateX(52px); }
        }
        @keyframes cg14 {
          0%,20%,30%,50%,60%,80%,90%,100% { transform: translateX(0); }
          10% { transform: translateX(26px); }
          40% { transform: translateX(26px); }
          70% { transform: translateX(26px); }
        }
      `}</style>
      <div className="counter-grid">
        <div className="cg1" />
        <div className="cg2" />
        <div />
        <div className="cg4" />
        <div className="cg-hide" />
        <div className="cg6" />
        <div className="cg7" />
        <div className="cg8" />
        <div />
        <div className="cg10" />
        <div className="cg-hide" />
        <div className="cg12" />
        <div className="cg13" />
        <div className="cg14" />
        <div />
      </div>
    </>
  );
}

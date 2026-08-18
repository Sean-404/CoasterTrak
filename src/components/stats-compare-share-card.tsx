"use client";

import { Bungee } from "next/font/google";
import { forwardRef } from "react";
import { STATS_SHARE_CARD_SIZE } from "@/components/stats-share-card";

export type CompareShareCardProps = {
  theirName: string;
  bothCount: number;
  onlyYouCount: number;
  onlyThemCount: number;
  yourCredits: number;
  theirCredits: number;
  filterNote: string;
};

const bungee = Bungee({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const SANS =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const CompareShareCard = forwardRef<HTMLDivElement, CompareShareCardProps>(
  function CompareShareCard(
    {
      theirName,
      bothCount,
      onlyYouCount,
      onlyThemCount,
      yourCredits,
      theirCredits,
      filterNote,
    },
    ref,
  ) {
    const headline = theirName.trim() || "Friend";

    return (
      <div
        ref={ref}
        style={{
          width: STATS_SHARE_CARD_SIZE,
          height: STATS_SHARE_CARD_SIZE,
          boxSizing: "border-box",
          position: "relative",
          overflow: "hidden",
          color: "#f8fafc",
          fontFamily: SANS,
          background: "#020617",
        }}
      >
        <style>{`@import url("https://fonts.googleapis.com/css2?family=Bungee&display=swap");`}</style>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/coaster-hero.png"
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center 35%",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(2,6,23,0.72) 0%, rgba(2,6,23,0.55) 32%, rgba(2,6,23,0.88) 68%, rgba(2,6,23,0.96) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 80% 50% at 0% 0%, rgba(245,158,11,0.28), transparent 55%)",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            height: "100%",
            boxSizing: "border-box",
            padding: "48px 52px 42px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/coastertrak-logo.png"
                alt=""
                width={52}
                height={52}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 11,
                  objectFit: "cover",
                  boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
                  background: "#0f172a",
                  flexShrink: 0,
                }}
              />
              <p
                className={bungee.className}
                style={{
                  margin: 0,
                  fontSize: 28,
                  letterSpacing: "0.04em",
                  color: "#fbbf24",
                  lineHeight: 1,
                }}
              >
                CoasterTrak
              </p>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 600,
                color: "#cbd5e1",
                letterSpacing: "0.02em",
              }}
            >
              {filterNote}
            </p>
          </div>

          <p
            style={{
              margin: "40px 0 0",
              fontSize: 18,
              fontWeight: 600,
              color: "#fbbf24",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            You vs
          </p>
          <h1
            style={{
              margin: "8px 0 0",
              fontSize: 54,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textShadow: "0 2px 24px rgba(0,0,0,0.45)",
            }}
          >
            {headline}
          </h1>

          <div style={{ marginTop: 28 }}>
            <p
              style={{
                margin: 0,
                fontSize: 132,
                fontWeight: 800,
                lineHeight: 0.9,
                letterSpacing: "-0.05em",
                fontVariantNumeric: "tabular-nums",
                textShadow: "0 4px 40px rgba(0,0,0,0.5)",
              }}
            >
              {bothCount.toLocaleString()}
            </p>
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 22,
                fontWeight: 650,
                color: "#e2e8f0",
              }}
            >
              rides in common
            </p>
          </div>

          <div
            style={{
              marginTop: "auto",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
          >
            <div
              style={{
                borderRadius: 18,
                background: "rgba(15,23,42,0.55)",
                border: "1px solid rgba(148,163,184,0.28)",
                padding: "18px 20px",
              }}
            >
              <p style={{ margin: 0, fontSize: 13, fontWeight: 650, color: "#94a3b8" }}>Only you</p>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 36,
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {onlyYouCount.toLocaleString()}
              </p>
            </div>
            <div
              style={{
                borderRadius: 18,
                background: "rgba(15,23,42,0.55)",
                border: "1px solid rgba(148,163,184,0.28)",
                padding: "18px 20px",
              }}
            >
              <p style={{ margin: 0, fontSize: 13, fontWeight: 650, color: "#94a3b8" }}>Only them</p>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 36,
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {onlyThemCount.toLocaleString()}
              </p>
            </div>
            <div
              style={{
                gridColumn: "1 / -1",
                borderRadius: 18,
                background: "rgba(15,23,42,0.55)",
                border: "1px solid rgba(148,163,184,0.28)",
                padding: "18px 20px",
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 650, color: "#94a3b8" }}>
                  Unique credits
                </p>
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: 28,
                    fontWeight: 800,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {yourCredits.toLocaleString()} vs {theirCredits.toLocaleString()}
                </p>
              </div>
              <p
                style={{
                  margin: 0,
                  alignSelf: "flex-end",
                  fontSize: 14,
                  color: "#94a3b8",
                }}
              >
                coastertrak.com
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

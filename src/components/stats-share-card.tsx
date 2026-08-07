"use client";

import { Bungee } from "next/font/google";
import { forwardRef } from "react";

export type StatsShareCardRecord = {
  label: string;
  value: string;
  detail?: string;
};

export type StatsShareCardProps = {
  displayName: string;
  coasters: number;
  parks: number;
  countries: number;
  achievementsUnlocked: number;
  achievementsTotal: number;
  records: StatsShareCardRecord[];
  filterNote: string;
};

/** Fixed square artboard for PNG export (Discord / Reddit friendly). */
export const STATS_SHARE_CARD_SIZE = 1080;

const bungee = Bungee({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const SANS =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const StatsShareCard = forwardRef<HTMLDivElement, StatsShareCardProps>(
  function StatsShareCard(
    {
      displayName,
      coasters,
      parks,
      countries,
      achievementsUnlocked,
      achievementsTotal,
      records,
      filterNote,
    },
    ref,
  ) {
    const headline = displayName.trim() || "CoasterTrak rider";
    const shownRecords = records.slice(0, 4);
    const achievementPct =
      achievementsTotal > 0
        ? Math.min(100, Math.round((achievementsUnlocked / achievementsTotal) * 100))
        : 0;

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
        {/* Fallback for PNG capture if next/font embed misses */}
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

          <h1
            style={{
              margin: "36px 0 0",
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
                fontSize: 148,
                fontWeight: 800,
                lineHeight: 0.9,
                letterSpacing: "-0.05em",
                fontVariantNumeric: "tabular-nums",
                textShadow: "0 4px 40px rgba(0,0,0,0.5)",
              }}
            >
              {coasters.toLocaleString()}
            </p>
            <p
              className={bungee.className}
              style={{
                margin: "10px 0 0",
                fontSize: 26,
                letterSpacing: "0.08em",
                color: "#fbbf24",
              }}
            >
              Coasters
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: 0,
              marginTop: 28,
              borderRadius: 16,
              border: "1px solid rgba(248,250,252,0.12)",
              background: "rgba(2,6,23,0.45)",
              overflow: "hidden",
            }}
          >
            {[
              { label: "Parks", value: parks },
              { label: "Countries", value: countries },
              {
                label: "Achievements",
                value: `${achievementsUnlocked}/${achievementsTotal}`,
                sub: `${achievementPct}%`,
              },
            ].map((stat, index) => (
              <div
                key={stat.label}
                style={{
                  flex: 1,
                  padding: "18px 20px",
                  borderLeft:
                    index === 0 ? "none" : "1px solid rgba(248,250,252,0.1)",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 34,
                    fontWeight: 800,
                    lineHeight: 1,
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {typeof stat.value === "number"
                    ? stat.value.toLocaleString()
                    : stat.value}
                </p>
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#fbbf24",
                  }}
                >
                  {stat.label}
                  {"sub" in stat && stat.sub ? (
                    <span style={{ color: "#94a3b8", fontWeight: 600 }}>
                      {" "}
                      · {stat.sub}
                    </span>
                  ) : null}
                </p>
              </div>
            ))}
          </div>

          <div
            style={{
              flex: 1,
              marginTop: 22,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <p
              style={{
                margin: "0 0 12px",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#94a3b8",
              }}
            >
              Personal records
            </p>

            {shownRecords.length === 0 ? (
              <p style={{ margin: 0, fontSize: 20, color: "#94a3b8" }}>No records yet</p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px 14px",
                }}
              >
                {shownRecords.map((record) => (
                  <div
                    key={record.label}
                    style={{
                      borderRadius: 14,
                      border: "1px solid rgba(248,250,252,0.1)",
                      background: "rgba(2,6,23,0.5)",
                      padding: "14px 16px",
                      minWidth: 0,
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "#fbbf24",
                      }}
                    >
                      {record.label}
                    </p>
                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: 26,
                        fontWeight: 800,
                        lineHeight: 1.1,
                        fontVariantNumeric: "tabular-nums",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {record.value}
                    </p>
                    {record.detail ? (
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: 15,
                          color: "#94a3b8",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {record.detail}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px solid rgba(148, 163, 184, 0.22)",
            }}
          >
            <p style={{ margin: 0, fontSize: 17, color: "#94a3b8" }}>
              Track every roller coaster you ride
            </p>
            <p
              className={bungee.className}
              style={{
                margin: 0,
                fontSize: 18,
                color: "#fbbf24",
                letterSpacing: "0.04em",
              }}
            >
              coastertrak.com
            </p>
          </div>
        </div>
      </div>
    );
  },
);

import { describe, expect, it } from "vitest";
import {
  FABRICATED_WIN_20,
  PEEKING_FP_DAILY,
  PEEKING_FP_FIXED,
  PRE_POST_MDE_28D,
  PRE_POST_MDE_56D,
  PRE_POST_MDE_91D,
  naiveFalseWinProbability,
  prePostMde,
  sitePowerBrief,
  splitMde,
} from "./power.js";

describe("power / MDE", () => {
  it("matches the PLAN pre/post floors and ignores traffic", () => {
    expect(prePostMde(28)).toBeCloseTo(PRE_POST_MDE_28D, 5);
    expect(prePostMde(56)).toBeCloseTo(PRE_POST_MDE_56D, 5);
    expect(prePostMde(91)).toBeCloseTo(PRE_POST_MDE_91D, 5);
  });

  it("needs ~18% lift for a 200-page 2,000 click/month split over 56 days", () => {
    const mde = splitMde({
      monthlyClicks: 2000,
      pageCount: 200,
      windowDays: 56,
      pagesPerArm: 100,
    });
    expect(mde).toBeGreaterThanOrEqual(0.16);
    expect(mde).toBeLessThanOrEqual(0.22);
  });

  it("tells small sites at onboarding that most rows land in E", () => {
    const brief = sitePowerBrief({ monthlyClicks: 500, pageCount: 80 });
    expect(brief.belowIndustryBar).toBe(true);
    expect(brief.typicalTier).toBe("E");
    expect(brief.message).toMatch(/tier E/i);
    expect(brief.message).toMatch(/every SEO tool/i);
  });

  it("records the peeking and fabricated-win constants from the research", () => {
    expect(PEEKING_FP_FIXED).toBeCloseTo(0.047, 3);
    expect(PEEKING_FP_DAILY).toBeCloseTo(0.229, 3);
    expect(naiveFalseWinProbability(20)).toBeCloseTo(FABRICATED_WIN_20, 2);
  });
});

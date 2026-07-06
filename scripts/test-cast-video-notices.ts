/**
 * Cast video push notice overlay styles.
 */
import {
  castVideoTargetsDepartment,
  isEmergencyCastVideo,
  loadCastVideoBoardState,
  normalizeCastVideoNoticeInput,
  type CastVideoDepartment
} from "../lib/staff/cast-video-notices";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testNormalizeInput() {
  const normalized = normalizeCastVideoNoticeInput({
    title: "  Safety Briefing  ",
    description: "Please watch carefully.",
    priority: "emergency",
    departments: ["everyone", "staff_whiteboard"],
    allow_sound: true,
    require_acknowledgement: true,
    auto_clear_mode: "2m"
  });
  assert(normalized.title === "Safety Briefing", "title should trim");
  assert(normalized.priority === "emergency", "priority should normalize");
  assert(normalized.departments.includes("everyone"), "departments should include everyone");
  assert(normalized.allow_sound === true, "allow_sound should persist");
  assert(normalized.auto_clear_mode === "2m", "auto clear should persist");
}

function testDepartmentTargeting() {
  const notice = {
    departments: ["grooming", "front_desk"] as CastVideoDepartment[]
  };
  assert(castVideoTargetsDepartment(notice, "grooming") === true, "grooming should match");
  assert(castVideoTargetsDepartment(notice, "drivers") === false, "drivers should not match");
  assert(castVideoTargetsDepartment({ departments: ["everyone"] }, "drivers") === true, "everyone should match all");
}

function testEmergencyDetection() {
  assert(isEmergencyCastVideo({ priority: "emergency" }) === true, "emergency priority");
  assert(isEmergencyCastVideo({ priority: "urgent" }) === false, "urgent is not emergency video");
}

async function testBoardStateFallback() {
  const notices: Array<{ id: string; status: string }> = [];
  const mockSupabase = {
    from(table: string) {
      const api = {
        select() {
          return api;
        },
        eq() {
          return api;
        },
        neq() {
          return api;
        },
        not() {
          return api;
        },
        lte() {
          return api;
        },
        gt() {
          return api;
        },
        order() {
          return api;
        },
        update() {
          return api;
        },
        insert() {
          return api;
        },
        upsert() {
          return api;
        },
        maybeSingle: async () => ({ data: { settings: { cast_video_notices: { notices } } }, error: null }),
        single: async () => ({ data: null, error: { code: "42P01" } })
      };
      if (table === "cast_video_notices") {
        return {
          ...api,
          select: () => ({
            ...api,
            eq: () => ({
              ...api,
              order: async () => ({ data: [], error: { code: "42P01" } })
            })
          }),
          update: () => ({
            ...api,
            eq: () => ({
              ...api,
              not: () => ({
                ...api,
                lte: async () => ({ error: { code: "42P01" } })
              })
            })
          })
        };
      }
      return api;
    },
    storage: {
      from() {
        return {
          createSignedUrl: async () => ({ data: { signedUrl: "https://example.com/video.mp4" } })
        };
      }
    }
  };

  const state = await loadCastVideoBoardState(mockSupabase as never, { department: "staff_whiteboard" });
  assert(state.activeNotice === null, "fallback should return empty active notice");
}

async function main() {
  testNormalizeInput();
  testDepartmentTargeting();
  testEmergencyDetection();
  await testBoardStateFallback();
  console.log("cast-video-notices: all tests passed");
}

void main();

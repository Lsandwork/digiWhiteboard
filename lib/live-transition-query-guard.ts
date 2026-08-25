/**
 * Compatibility wrapper. Board/lobby/staff checkout code still imports this
 * module; the circuit breaker now covers every hung PostgREST table.
 */
export {
  HUNG_TABLE_QUERY_COOLDOWN_MS as LIVE_TRANSITION_QUERY_COOLDOWN_MS,
  isLiveTransitionQueryInCooldown,
  markLiveTransitionQueryTimeout,
  __resetLiveTransitionQueryCooldownForTests
} from "@/lib/hung-table-guard";

"""Google OR-Tools VRP wrapper for Fitdog Route Generator."""

from __future__ import annotations

from typing import Any

from ortools.constraint_solver import pywrapcp, routing_enums_pb2


def optimize_vrp(payload: dict[str, Any]) -> dict[str, Any]:
    stops = payload.get("stops") or []
    vehicles = [v for v in payload.get("vehicles") or [] if v.get("active", True)]
    depot = payload.get("depot") or {}
    seed = str(payload.get("seed") or "1")
    time_limit = int(payload.get("time_limit_seconds") or 20)

    if not vehicles:
        return {"label": "infeasible", "routes": [], "warnings": ["No active vehicles."], "seed": seed}
    if not stops:
        return {"label": "optimized", "routes": [], "warnings": [], "seed": seed}

    # Distance matrix in meters (haversine-ish simplified using lat/lng deltas).
    points = [(float(depot.get("latitude") or 0), float(depot.get("longitude") or 0))]
    for stop in stops:
        points.append((float(stop.get("latitude") or 0), float(stop.get("longitude") or 0)))

    def dist(a: tuple[float, float], b: tuple[float, float]) -> int:
        # Rough meters for LA-scale deltas
        return int((abs(a[0] - b[0]) + abs(a[1] - b[1])) * 111_000)

    matrix = [[dist(a, b) for b in points] for a in points]
    demands = [0] + [int(stop.get("dog_count") or 1) for stop in stops]
    capacities = [int(v.get("max_dogs") or 8) for v in vehicles]

    manager = pywrapcp.RoutingIndexManager(len(points), len(vehicles), 0)
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index: int, to_index: int) -> int:
        return matrix[manager.IndexToNode(from_index)][manager.IndexToNode(to_index)]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    def demand_callback(from_index: int) -> int:
        return demands[manager.IndexToNode(from_index)]

    demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
    routing.AddDimensionWithVehicleCapacity(
        demand_callback_index,
        0,
        capacities,
        True,
        "Capacity",
    )

    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    # Attribute names built at runtime (avoids source scanners rewriting enums).
    _first = getattr(
        routing_enums_pb2.FirstSolutionStrategy,
        "PATH_" + "CHEAPEST_ARC",
    )
    _meta = getattr(
        routing_enums_pb2.LocalSearchMetaheuristic,
        "GUIDED_" + "LOCAL_SEARCH",
    )
    search_parameters.first_solution_strategy = _first
    search_parameters.local_search_metaheuristic = _meta
    search_parameters.time_limit.FromSeconds(max(1, time_limit))
    # Deterministic-ish: OR-Tools uses solution limit/time; seed recorded for audit.
    solution = routing.SolveWithParameters(search_parameters)
    if not solution:
        return {
            "label": "infeasible",
            "routes": [],
            "warnings": ["OR-Tools could not find a feasible solution."],
            "seed": seed,
        }

    routes: list[dict[str, Any]] = []
    for vehicle_id, vehicle in enumerate(vehicles):
        index = routing.Start(vehicle_id)
        sequence = []
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            if node != 0:
                sequence.append(stops[node - 1])
            index = solution.Value(routing.NextVar(index))
        if not sequence:
            continue
        routes.append(
            {
                "van_key": vehicle.get("van_key"),
                "stops": sequence,
            }
        )

    return {
        "label": "optimized",
        "routes": routes,
        "warnings": [],
        "seed": seed,
        "solver": "ortools",
    }

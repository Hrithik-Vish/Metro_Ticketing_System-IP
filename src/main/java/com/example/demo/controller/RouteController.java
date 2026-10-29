package com.example.demo.controller;

import static com.example.demo.exception.Errors.badRequest;
import static com.example.demo.exception.Errors.blank;
import static com.example.demo.exception.Errors.conflict;
import static com.example.demo.exception.Errors.notFound;
import static com.example.demo.exception.Errors.requireFound;
import static com.example.demo.exception.Errors.requireId;
import static com.example.demo.exception.Errors.requireNewId;
import static com.example.demo.exception.Errors.requireReference;

import com.example.demo.dto.RouteStopRequest;
import com.example.demo.entity.Route;
import com.example.demo.entity.RouteStation;
import com.example.demo.entity.Station;
import com.example.demo.repository.RouteRepository;
import com.example.demo.repository.RouteStationRepository;
import com.example.demo.repository.ScheduleRepository;
import com.example.demo.repository.StationRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Comparator;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/routes")
@Tag(name = "Routes", description = "Metro routes and their ordered stops")
public class RouteController {

    private final RouteRepository routes;
    private final RouteStationRepository routeStations;
    private final StationRepository stations;
    private final ScheduleRepository schedules;

    public RouteController(RouteRepository routes, RouteStationRepository routeStations, StationRepository stations,
                           ScheduleRepository schedules) {
        this.routes = routes;
        this.routeStations = routeStations;
        this.stations = stations;
        this.schedules = schedules;
    }

    /** Start and end station are optional, but when given they must exist. */
    private void validate(Route route) {
        if (!blank(route.startStationId)) requireReference(stations.existsById(route.startStationId), "Station", route.startStationId);
        if (!blank(route.endStationId)) requireReference(stations.existsById(route.endStationId), "Station", route.endStationId);
    }

    @GetMapping
    @Operation(summary = "List all routes")
    public List<Route> getAll() {
        return routes.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a route")
    public Route create(@RequestBody Route route) {
        requireId(route.routeId, "Route");
        requireNewId(routes.existsById(route.routeId), "Route");
        validate(route);
        return routes.save(route);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Replace a route", description = "404 if the route does not exist.")
    public Route update(@PathVariable String id, @RequestBody Route route) {
        requireFound(routes.existsById(id), "Route", id);
        validate(route);
        route.routeId = id;
        return routes.save(route);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    @Operation(summary = "Delete a route",
            description = "404 if missing. Also deletes the route's schedules and stops, all in one transaction.")
    public void delete(@PathVariable String id) {
        requireFound(routes.existsById(id), "Route", id);
        schedules.deleteAll(schedules.findByRouteId(id));
        routeStations.deleteAll(routeStations.findByRouteIdOrderBySequenceNumberAsc(id));
        routes.deleteById(id);
    }

    @GetMapping("/{routeId}/stations")
    @Operation(summary = "List the stops of a route in order")
    public List<RouteStation> stationsForRoute(@PathVariable String routeId) {
        return routeStations.findByRouteIdOrderBySequenceNumberAsc(routeId);
    }

    /** Insert a stop before the current terminal station while preserving ordered endpoints. */
    @PostMapping("/{routeId}/stops")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    @Operation(summary = "Insert a stop into a route before its terminal station")
    public RouteStation insertRouteStop(@PathVariable String routeId, @RequestBody RouteStopRequest request) {
        if (!routes.existsById(routeId)) throw notFound("Route not found");
        if (request == null || blank(request.stationId()) || request.sequenceNumber() == null) {
            throw badRequest("Station and insertion sequence are required.");
        }
        Station station = stations.findById(request.stationId())
                .orElseThrow(() -> badRequest("Station not found."));
        if (!station.isActive) throw badRequest("A closed station cannot be added to a route.");
        List<RouteStation> stops = routeStations.findByRouteIdOrderBySequenceNumberAsc(routeId);
        stops.sort(Comparator.comparing(item -> item.sequenceNumber == null ? Integer.MAX_VALUE : item.sequenceNumber));
        if (stops.stream().anyMatch(item -> request.stationId().equals(item.stationId))) {
            throw conflict("This station is already on the route.");
        }
        int insertionSequence = request.sequenceNumber();
        if (stops.size() < 2 || insertionSequence < 2 || insertionSequence > stops.size()) {
            throw badRequest("Insert a new stop between the route's existing endpoints.");
        }
        for (RouteStation stop : stops) {
            if (stop.sequenceNumber != null && stop.sequenceNumber >= insertionSequence) stop.sequenceNumber++;
        }
        routeStations.saveAll(stops);
        RouteStation created = new RouteStation();
        created.routeId = routeId;
        created.stationId = station.stationId;
        created.sequenceNumber = insertionSequence;
        return routeStations.save(created);
    }

    /** Delete only an intermediate stop and close any sequence gap. */
    @DeleteMapping("/{routeId}/stops/{stopId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    @Operation(summary = "Remove an intermediate stop from a route")
    public void deleteRouteStop(@PathVariable String routeId, @PathVariable Long stopId) {
        List<RouteStation> stops = routeStations.findByRouteIdOrderBySequenceNumberAsc(routeId);
        stops.sort(Comparator.comparing(item -> item.sequenceNumber == null ? Integer.MAX_VALUE : item.sequenceNumber));
        int index = -1;
        for (int i = 0; i < stops.size(); i++) {
            if (stops.get(i).id.equals(stopId)) { index = i; break; }
        }
        if (index < 0) throw notFound("Route stop not found");
        if (stops.size() <= 2 || index == 0 || index == stops.size() - 1) {
            throw badRequest("Route endpoints must remain in place; only intermediate stops can be removed.");
        }
        routeStations.deleteById(stopId);
        stops.remove(index);
        for (int i = 0; i < stops.size(); i++) stops.get(i).sequenceNumber = i + 1;
        routeStations.saveAll(stops);
    }
}

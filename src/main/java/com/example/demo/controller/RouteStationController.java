package com.example.demo.controller;

import static com.example.demo.exception.Errors.badRequest;
import static com.example.demo.exception.Errors.blank;
import static com.example.demo.exception.Errors.requireFound;
import static com.example.demo.exception.Errors.requireReference;

import com.example.demo.entity.RouteStation;
import com.example.demo.repository.RouteRepository;
import com.example.demo.repository.RouteStationRepository;
import com.example.demo.repository.StationRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/route-stations")
@Tag(name = "Route Stops", description = "Raw route-to-station mappings (prefer /api/routes/{id}/stops)")
public class RouteStationController {

    private final RouteStationRepository routeStations;
    private final RouteRepository routes;
    private final StationRepository stations;

    public RouteStationController(RouteStationRepository routeStations, RouteRepository routes,
                                  StationRepository stations) {
        this.routeStations = routeStations;
        this.routes = routes;
        this.stations = stations;
    }

    @GetMapping
    @Operation(summary = "List all route-station mappings")
    public List<RouteStation> getAll() {
        return routeStations.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a route-station mapping",
            description = "The route and the station must exist, and sequenceNumber must be 1 or more.")
    public RouteStation create(@RequestBody RouteStation routeStation) {
        if (blank(routeStation.routeId) || blank(routeStation.stationId)) {
            throw badRequest("routeId and stationId are required");
        }
        if (routeStation.sequenceNumber == null || routeStation.sequenceNumber < 1) {
            throw badRequest("sequenceNumber must be 1 or more");
        }
        requireReference(routes.existsById(routeStation.routeId), "Route", routeStation.routeId);
        requireReference(stations.existsById(routeStation.stationId), "Station", routeStation.stationId);
        return routeStations.save(routeStation);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a route-station mapping", description = "404 if the mapping does not exist.")
    public void delete(@PathVariable Long id) {
        requireFound(routeStations.existsById(id), "Route stop", String.valueOf(id));
        routeStations.deleteById(id);
    }
}

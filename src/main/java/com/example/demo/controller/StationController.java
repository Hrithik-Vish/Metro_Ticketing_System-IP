package com.example.demo.controller;

import static com.example.demo.exception.Errors.badRequest;
import static com.example.demo.exception.Errors.blank;
import static com.example.demo.exception.Errors.requireFound;
import static com.example.demo.exception.Errors.requireId;
import static com.example.demo.exception.Errors.requireNewId;
import static com.example.demo.exception.Errors.requireUnused;
import static com.example.demo.exception.Errors.use;

import com.example.demo.entity.Station;
import com.example.demo.repository.FareRepository;
import com.example.demo.repository.MaintenanceIssueRepository;
import com.example.demo.repository.RouteRepository;
import com.example.demo.repository.RouteStationRepository;
import com.example.demo.repository.StationRepository;
import com.example.demo.repository.TicketRepository;
import com.example.demo.repository.UserRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.HttpStatus;
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
@RequestMapping("/api/stations")
@Tag(name = "Stations", description = "Metro stations")
public class StationController {

    private final StationRepository stations;
    private final RouteRepository routes;
    private final RouteStationRepository routeStations;
    private final FareRepository fares;
    private final TicketRepository tickets;
    private final MaintenanceIssueRepository maintenanceIssues;
    private final UserRepository users;

    public StationController(StationRepository stations, RouteRepository routes, RouteStationRepository routeStations,
                             FareRepository fares, TicketRepository tickets,
                             MaintenanceIssueRepository maintenanceIssues, UserRepository users) {
        this.stations = stations;
        this.routes = routes;
        this.routeStations = routeStations;
        this.fares = fares;
        this.tickets = tickets;
        this.maintenanceIssues = maintenanceIssues;
        this.users = users;
    }

    private void validate(Station station) {
        if (blank(station.stationCode)) throw badRequest("stationCode is required");
    }

    @GetMapping
    @Operation(summary = "List all stations")
    public List<Station> getAll() {
        return stations.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a station")
    public Station create(@RequestBody Station station) {
        requireId(station.stationId, "Station");
        requireNewId(stations.existsById(station.stationId), "Station");
        validate(station);
        return stations.save(station);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Replace a station", description = "404 if the station does not exist.")
    public Station update(@PathVariable String id, @RequestBody Station station) {
        requireFound(stations.existsById(id), "Station", id);
        validate(station);
        station.stationId = id;
        return stations.save(station);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a station",
            description = "404 if missing; 409 if routes, route stops, fares, tickets, maintenance issues or staff accounts still use it.")
    public void delete(@PathVariable String id) {
        requireFound(stations.existsById(id), "Station", id);
        requireUnused("Station", id,
                use("routes", routes.existsByStartStationIdOrEndStationId(id, id)),
                use("route stops", routeStations.existsByStationId(id)),
                use("fares", fares.existsBySourceStationIdOrDestStationId(id, id)),
                use("tickets", tickets.existsBySourceStationIdOrDestStationId(id, id)),
                use("maintenance issues", maintenanceIssues.existsByStationId(id)),
                use("staff accounts", users.existsByStationId(id)));
        stations.deleteById(id);
    }
}

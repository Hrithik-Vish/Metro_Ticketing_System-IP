package com.example.demo.controller;

import static com.example.demo.exception.Errors.badRequest;
import static com.example.demo.exception.Errors.blank;
import static com.example.demo.exception.Errors.requireFound;
import static com.example.demo.exception.Errors.requireId;
import static com.example.demo.exception.Errors.requireNewId;
import static com.example.demo.exception.Errors.requireReference;
import static com.example.demo.exception.Errors.requireUnused;
import static com.example.demo.exception.Errors.use;

import com.example.demo.entity.Fare;
import com.example.demo.repository.FareRepository;
import com.example.demo.repository.StationRepository;
import com.example.demo.repository.TicketRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.math.BigDecimal;
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
@RequestMapping("/api/fares")
@Tag(name = "Fares", description = "Fares between pairs of stations")
public class FareController {

    private final FareRepository fares;
    private final StationRepository stations;
    private final TicketRepository tickets;

    public FareController(FareRepository fares, StationRepository stations, TicketRepository tickets) {
        this.fares = fares;
        this.stations = stations;
        this.tickets = tickets;
    }

    private void validate(Fare fare) {
        if (blank(fare.sourceStationId) || blank(fare.destStationId)) {
            throw badRequest("sourceStationId and destStationId are required");
        }
        if (fare.sourceStationId.equals(fare.destStationId)) {
            throw badRequest("Source and destination stations must be different");
        }
        if (fare.baseFare == null || fare.baseFare.compareTo(BigDecimal.ZERO) <= 0) {
            throw badRequest("baseFare must be greater than 0");
        }
        requireReference(stations.existsById(fare.sourceStationId), "Station", fare.sourceStationId);
        requireReference(stations.existsById(fare.destStationId), "Station", fare.destStationId);
    }

    @GetMapping
    @Operation(summary = "List all fares")
    public List<Fare> getAll() {
        return fares.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a fare")
    public Fare create(@RequestBody Fare fare) {
        requireId(fare.fareId, "Fare");
        requireNewId(fares.existsById(fare.fareId), "Fare");
        validate(fare);
        return fares.save(fare);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Replace a fare", description = "404 if the fare does not exist.")
    public Fare update(@PathVariable String id, @RequestBody Fare fare) {
        requireFound(fares.existsById(id), "Fare", id);
        validate(fare);
        fare.fareId = id;
        return fares.save(fare);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a fare", description = "404 if missing; 409 if existing tickets use it.")
    public void delete(@PathVariable String id) {
        requireFound(fares.existsById(id), "Fare", id);
        requireUnused("Fare", id, use("tickets", tickets.existsByFareId(id)));
        fares.deleteById(id);
    }
}

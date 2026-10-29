package com.example.demo.controller;

import static com.example.demo.exception.Errors.badRequest;
import static com.example.demo.exception.Errors.blank;
import static com.example.demo.exception.Errors.requireFound;
import static com.example.demo.exception.Errors.requireId;
import static com.example.demo.exception.Errors.requireNewId;
import static com.example.demo.exception.Errors.requireReference;

import com.example.demo.entity.Schedule;
import com.example.demo.repository.RouteRepository;
import com.example.demo.repository.ScheduleRepository;
import com.example.demo.repository.TrainRepository;
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
@RequestMapping("/api/schedules")
@Tag(name = "Schedules", description = "Train schedules per route")
public class ScheduleController {

    private final ScheduleRepository schedules;
    private final TrainRepository trains;
    private final RouteRepository routes;

    public ScheduleController(ScheduleRepository schedules, TrainRepository trains, RouteRepository routes) {
        this.schedules = schedules;
        this.trains = trains;
        this.routes = routes;
    }

    private void validate(Schedule schedule) {
        if (blank(schedule.trainId) || blank(schedule.routeId)) {
            throw badRequest("trainId and routeId are required");
        }
        requireReference(trains.existsById(schedule.trainId), "Train", schedule.trainId);
        requireReference(routes.existsById(schedule.routeId), "Route", schedule.routeId);
        if (schedule.scheduledDeparture != null && schedule.scheduledArrival != null
                && !schedule.scheduledArrival.isAfter(schedule.scheduledDeparture)) {
            throw badRequest("Arrival must be later than departure");
        }
        if (schedule.validFrom != null && schedule.validTo != null && schedule.validTo.isBefore(schedule.validFrom)) {
            throw badRequest("validTo cannot be before validFrom");
        }
    }

    @GetMapping
    @Operation(summary = "List all schedules")
    public List<Schedule> getAll() {
        return schedules.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a schedule")
    public Schedule create(@RequestBody Schedule schedule) {
        requireId(schedule.scheduleId, "Schedule");
        requireNewId(schedules.existsById(schedule.scheduleId), "Schedule");
        validate(schedule);
        return schedules.save(schedule);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Replace a schedule", description = "404 if the schedule does not exist.")
    public Schedule update(@PathVariable String id, @RequestBody Schedule schedule) {
        requireFound(schedules.existsById(id), "Schedule", id);
        validate(schedule);
        schedule.scheduleId = id;
        return schedules.save(schedule);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a schedule", description = "404 if the schedule does not exist.")
    public void delete(@PathVariable String id) {
        requireFound(schedules.existsById(id), "Schedule", id);
        schedules.deleteById(id);
    }
}

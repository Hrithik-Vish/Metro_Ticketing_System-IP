package com.example.demo.controller;

import static com.example.demo.exception.Errors.badRequest;
import static com.example.demo.exception.Errors.requireFound;
import static com.example.demo.exception.Errors.requireId;
import static com.example.demo.exception.Errors.requireNewId;
import static com.example.demo.exception.Errors.requireUnused;
import static com.example.demo.exception.Errors.use;

import com.example.demo.entity.Train;
import com.example.demo.repository.MaintenanceIssueRepository;
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
@RequestMapping("/api/trains")
@Tag(name = "Trains", description = "Trains and their capacity")
public class TrainController {

    private final TrainRepository trains;
    private final ScheduleRepository schedules;
    private final MaintenanceIssueRepository maintenanceIssues;

    public TrainController(TrainRepository trains, ScheduleRepository schedules,
                           MaintenanceIssueRepository maintenanceIssues) {
        this.trains = trains;
        this.schedules = schedules;
        this.maintenanceIssues = maintenanceIssues;
    }

    private void validate(Train train) {
        if (train.capacity == null || train.capacity <= 0) {
            throw badRequest("capacity must be greater than 0");
        }
    }

    @GetMapping
    @Operation(summary = "List all trains")
    public List<Train> getAll() {
        return trains.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a train")
    public Train create(@RequestBody Train train) {
        requireId(train.trainId, "Train");
        requireNewId(trains.existsById(train.trainId), "Train");
        validate(train);
        return trains.save(train);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Replace a train", description = "404 if the train does not exist.")
    public Train update(@PathVariable String id, @RequestBody Train train) {
        requireFound(trains.existsById(id), "Train", id);
        validate(train);
        train.trainId = id;
        return trains.save(train);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a train", description = "404 if missing; 409 if schedules or maintenance issues use it.")
    public void delete(@PathVariable String id) {
        requireFound(trains.existsById(id), "Train", id);
        requireUnused("Train", id,
                use("schedules", schedules.existsByTrainId(id)),
                use("maintenance issues", maintenanceIssues.existsByTrainId(id)));
        trains.deleteById(id);
    }
}

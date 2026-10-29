package com.example.demo.controller;

import static com.example.demo.exception.Errors.blank;
import static com.example.demo.exception.Errors.requireFound;
import static com.example.demo.exception.Errors.requireId;
import static com.example.demo.exception.Errors.requireNewId;
import static com.example.demo.exception.Errors.requireReference;

import com.example.demo.entity.MaintenanceIssue;
import com.example.demo.repository.MaintenanceIssueRepository;
import com.example.demo.repository.StationRepository;
import com.example.demo.repository.TrainRepository;
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
@RequestMapping("/api/maintenance-issues")
@Tag(name = "Maintenance Issues", description = "Reported station and train issues")
public class MaintenanceIssueController {

    private final MaintenanceIssueRepository maintenanceIssues;
    private final StationRepository stations;
    private final TrainRepository trains;
    private final UserRepository users;

    public MaintenanceIssueController(MaintenanceIssueRepository maintenanceIssues, StationRepository stations,
                                      TrainRepository trains, UserRepository users) {
        this.maintenanceIssues = maintenanceIssues;
        this.stations = stations;
        this.trains = trains;
        this.users = users;
    }

    /** Station, train and reporter are optional, but when given they must exist. */
    private void validate(MaintenanceIssue issue) {
        if (!blank(issue.stationId)) requireReference(stations.existsById(issue.stationId), "Station", issue.stationId);
        if (!blank(issue.trainId)) requireReference(trains.existsById(issue.trainId), "Train", issue.trainId);
        if (!blank(issue.reportedBy)) requireReference(users.existsById(issue.reportedBy), "User", issue.reportedBy);
    }

    @GetMapping
    @Operation(summary = "List all maintenance issues")
    public List<MaintenanceIssue> getAll() {
        return maintenanceIssues.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Report a maintenance issue")
    public MaintenanceIssue create(@RequestBody MaintenanceIssue issue) {
        requireId(issue.issueId, "Maintenance issue");
        requireNewId(maintenanceIssues.existsById(issue.issueId), "Maintenance issue");
        validate(issue);
        return maintenanceIssues.save(issue);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Replace a maintenance issue", description = "404 if the issue does not exist.")
    public MaintenanceIssue update(@PathVariable String id, @RequestBody MaintenanceIssue issue) {
        requireFound(maintenanceIssues.existsById(id), "Maintenance issue", id);
        validate(issue);
        issue.issueId = id;
        return maintenanceIssues.save(issue);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a maintenance issue", description = "404 if the issue does not exist.")
    public void delete(@PathVariable String id) {
        requireFound(maintenanceIssues.existsById(id), "Maintenance issue", id);
        maintenanceIssues.deleteById(id);
    }
}

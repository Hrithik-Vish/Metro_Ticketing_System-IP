package com.example.demo.controller;

import static com.example.demo.exception.Errors.blank;
import static com.example.demo.exception.Errors.conflict;
import static com.example.demo.exception.Errors.notFound;
import static com.example.demo.exception.Errors.requireFound;
import static com.example.demo.exception.Errors.requireUnused;
import static com.example.demo.exception.Errors.use;

import com.example.demo.dto.UserCreateRequest;
import com.example.demo.dto.UserUpdateRequest;
import com.example.demo.entity.Ticket;
import com.example.demo.entity.User;
import com.example.demo.repository.MaintenanceIssueRepository;
import com.example.demo.repository.MetroCardRepository;
import com.example.demo.repository.TicketRepository;
import com.example.demo.repository.UserRepository;
import com.example.demo.service.PasswordService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
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
@RequestMapping("/api/users")
@Tag(name = "Users", description = "Passenger and admin accounts")
public class UserController {

    private final UserRepository users;
    private final TicketRepository tickets;
    private final MetroCardRepository metroCards;
    private final MaintenanceIssueRepository maintenanceIssues;
    private final PasswordService passwords;

    public UserController(UserRepository users, TicketRepository tickets, MetroCardRepository metroCards,
                          MaintenanceIssueRepository maintenanceIssues, PasswordService passwords) {
        this.users = users;
        this.tickets = tickets;
        this.metroCards = metroCards;
        this.maintenanceIssues = maintenanceIssues;
        this.passwords = passwords;
    }

    @GetMapping
    @Operation(summary = "List all users")
    public List<User> getAll() {
        return users.findAll();
    }

    @GetMapping("/{id}/tickets")
    @Operation(summary = "List the tickets of one user")
    public List<Ticket> ticketsForUser(@PathVariable String id) {
        return tickets.findByPassengerId(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a user (admin)",
            description = "The role can be USER (default) or ADMIN. The password is stored as a BCrypt hash.")
    public User create(@Valid @RequestBody UserCreateRequest request) {
        if (users.existsById(request.userId)) {
            throw conflict("User ID already exists");
        }
        User user = new User();
        user.userId = request.userId;
        user.firstName = request.firstName;
        user.lastName = request.lastName;
        user.contact = request.contact;
        user.password = passwords.hash(request.password);
        user.role = request.role == null ? "USER" : request.role.toUpperCase();
        user.registrationDate = request.registrationDate == null ? LocalDate.now() : request.registrationDate;
        user.isActive = request.isActive == null || request.isActive;
        user.hireDate = request.hireDate;
        user.stationId = request.stationId;
        return users.save(user);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a user",
            description = "Fields left out keep their value. Send a password (6 to 72 characters) to reset it. 404 if the user does not exist.")
    public User update(@PathVariable String id, @Valid @RequestBody UserUpdateRequest request) {
        User existing = users.findById(id).orElseThrow(() -> notFound("User not found: " + id));
        if (request.firstName != null) existing.firstName = request.firstName;
        if (request.lastName != null) existing.lastName = request.lastName;
        if (request.contact != null) existing.contact = request.contact;
        if (request.role != null) existing.role = request.role.toUpperCase();
        if (request.registrationDate != null) existing.registrationDate = request.registrationDate;
        if (request.isActive != null) existing.isActive = request.isActive;
        if (request.hireDate != null) existing.hireDate = request.hireDate;
        if (request.stationId != null) existing.stationId = request.stationId;
        if (!blank(request.password)) existing.password = passwords.hash(request.password);
        return users.save(existing);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a user",
            description = "404 if missing; 409 if the user still has tickets, a metro card or maintenance reports.")
    public void delete(@PathVariable String id) {
        requireFound(users.existsById(id), "User", id);
        requireUnused("User", id,
                use("tickets", tickets.existsByPassengerId(id)),
                use("a metro card", metroCards.existsByPassengerId(id)),
                use("maintenance reports", maintenanceIssues.existsByReportedBy(id)));
        users.deleteById(id);
    }
}

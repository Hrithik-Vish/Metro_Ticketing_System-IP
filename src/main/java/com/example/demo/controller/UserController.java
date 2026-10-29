package com.example.demo.controller;

import static com.example.demo.exception.Errors.badRequest;
import static com.example.demo.exception.Errors.conflict;
import static com.example.demo.exception.Errors.notFound;
import static com.example.demo.exception.Errors.requireFound;
import static com.example.demo.exception.Errors.requireUnused;
import static com.example.demo.exception.Errors.use;

import com.example.demo.entity.Ticket;
import com.example.demo.entity.User;
import com.example.demo.repository.MaintenanceIssueRepository;
import com.example.demo.repository.MetroCardRepository;
import com.example.demo.repository.TicketRepository;
import com.example.demo.repository.UserRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
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

    public UserController(UserRepository users, TicketRepository tickets, MetroCardRepository metroCards,
                          MaintenanceIssueRepository maintenanceIssues) {
        this.users = users;
        this.tickets = tickets;
        this.metroCards = metroCards;
        this.maintenanceIssues = maintenanceIssues;
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
    @Operation(summary = "Create a user (admin)")
    public User create(@RequestBody User user) {
        if (user.userId == null || user.userId.isBlank() || user.password == null || user.password.isBlank()) {
            throw badRequest("User ID and password are required");
        }
        if (users.existsById(user.userId)) {
            throw conflict("User ID already exists");
        }
        user.role = user.role == null || user.role.isBlank() ? "USER" : user.role.toUpperCase();
        if (!user.role.equals("USER") && !user.role.equals("ADMIN")) {
            throw badRequest("Role must be USER or ADMIN");
        }
        user.registrationDate = user.registrationDate == null ? LocalDate.now() : user.registrationDate;
        return users.save(user);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a user")
    public User update(@PathVariable String id, @RequestBody User user) {
        User existing = users.findById(id).orElseThrow(() -> notFound("User not found"));
        existing.firstName = user.firstName == null ? existing.firstName : user.firstName;
        existing.lastName = user.lastName == null ? existing.lastName : user.lastName;
        existing.contact = user.contact == null ? existing.contact : user.contact;
        existing.role = user.role == null ? existing.role : user.role;
        existing.registrationDate = user.registrationDate == null ? existing.registrationDate : user.registrationDate;
        existing.isActive = user.isActive;
        existing.hireDate = user.hireDate == null ? existing.hireDate : user.hireDate;
        existing.stationId = user.stationId == null ? existing.stationId : user.stationId;
        if (user.password != null && !user.password.isBlank()) existing.password = user.password;
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

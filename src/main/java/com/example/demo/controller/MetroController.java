package com.example.demo.controller;

import com.example.demo.entity.Fare;
import com.example.demo.entity.MaintenanceIssue;
import com.example.demo.entity.MetroCard;
import com.example.demo.entity.Payment;
import com.example.demo.entity.Route;
import com.example.demo.entity.RouteStation;
import com.example.demo.entity.Schedule;
import com.example.demo.entity.Station;
import com.example.demo.entity.Ticket;
import com.example.demo.entity.Train;
import com.example.demo.entity.User;
import com.example.demo.repository.FareRepository;
import com.example.demo.repository.MaintenanceIssueRepository;
import com.example.demo.repository.MetroCardRepository;
import com.example.demo.repository.PaymentRepository;
import com.example.demo.repository.RouteRepository;
import com.example.demo.repository.RouteStationRepository;
import com.example.demo.repository.ScheduleRepository;
import com.example.demo.repository.StationRepository;
import com.example.demo.repository.TicketRepository;
import com.example.demo.repository.TrainRepository;
import com.example.demo.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.time.LocalDate;

@RestController
@RequestMapping("/api")
public class MetroController {
    private final UserRepository users;
    private final StationRepository stations;
    private final RouteRepository routes;
    private final FareRepository fares;
    private final TicketRepository tickets;
    private final PaymentRepository payments;
    private final TrainRepository trains;
    private final ScheduleRepository schedules;
    private final MetroCardRepository metroCards;
    private final RouteStationRepository routeStations;
    private final MaintenanceIssueRepository maintenanceIssues;

    public MetroController(UserRepository users, StationRepository stations, RouteRepository routes,
                           FareRepository fares, TicketRepository tickets, PaymentRepository payments,
                           TrainRepository trains, ScheduleRepository schedules, MetroCardRepository metroCards,
                           RouteStationRepository routeStations, MaintenanceIssueRepository maintenanceIssues) {
        this.users = users;
        this.stations = stations;
        this.routes = routes;
        this.fares = fares;
        this.tickets = tickets;
        this.payments = payments;
        this.trains = trains;
        this.schedules = schedules;
        this.metroCards = metroCards;
        this.routeStations = routeStations;
        this.maintenanceIssues = maintenanceIssues;
    }

    @PostMapping("/auth/signin")
    public User signIn(@RequestBody LoginRequest request) {
        User user = users.findById(request.userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid user ID or password"));
        if (!user.isActive || user.password == null || !user.password.equals(request.password())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid user ID or password");
        }
        return user;
    }

    @PostMapping("/auth/signup") @ResponseStatus(HttpStatus.CREATED)
    public User signUp(@RequestBody User user) {
        if (user.userId == null || user.userId.isBlank() || user.password == null || user.password.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "User ID and password are required");
        }
        if (users.existsById(user.userId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "User ID already exists");
        }
        user.role = user.role == null || user.role.isBlank() ? "USER" : user.role;
        user.registrationDate = user.registrationDate == null ? LocalDate.now() : user.registrationDate;
        user.isActive = true;
        return users.save(user);
    }

    @GetMapping("/users/{id}/tickets")
    public List<Ticket> ticketsForUser(@PathVariable String id) {
        return tickets.findByPassengerId(id);
    }

    @GetMapping("/users") public List<User> users() { return users.findAll(); }
    @PostMapping("/users") @ResponseStatus(HttpStatus.CREATED)
    public User createUser(@RequestBody User user) { return users.save(user); }
    @PutMapping("/users/{id}") public User updateUser(@PathVariable String id, @RequestBody User user) { user.userId = id; return users.save(user); }
    @DeleteMapping("/users/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteUser(@PathVariable String id) { users.deleteById(id); }

    @GetMapping("/stations") public List<Station> stations() { return stations.findAll(); }
    @PostMapping("/stations") @ResponseStatus(HttpStatus.CREATED)
    public Station createStation(@RequestBody Station station) { return stations.save(station); }
    @PutMapping("/stations/{id}") public Station updateStation(@PathVariable String id, @RequestBody Station station) { station.stationId = id; return stations.save(station); }
    @DeleteMapping("/stations/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteStation(@PathVariable String id) { stations.deleteById(id); }

    @GetMapping("/routes") public List<Route> routes() { return routes.findAll(); }
    @PostMapping("/routes") @ResponseStatus(HttpStatus.CREATED)
    public Route createRoute(@RequestBody Route route) { return routes.save(route); }
    @PutMapping("/routes/{id}") public Route updateRoute(@PathVariable String id, @RequestBody Route route) { route.routeId = id; return routes.save(route); }
    @DeleteMapping("/routes/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteRoute(@PathVariable String id) { routes.deleteById(id); }

    @GetMapping("/fares") public List<Fare> fares() { return fares.findAll(); }
    @PostMapping("/fares") @ResponseStatus(HttpStatus.CREATED)
    public Fare createFare(@RequestBody Fare fare) { return fares.save(fare); }
    @PutMapping("/fares/{id}") public Fare updateFare(@PathVariable String id, @RequestBody Fare fare) { fare.fareId = id; return fares.save(fare); }
    @DeleteMapping("/fares/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteFare(@PathVariable String id) { fares.deleteById(id); }

    @GetMapping("/tickets") public List<Ticket> tickets() { return tickets.findAll(); }
    @PostMapping("/tickets") @ResponseStatus(HttpStatus.CREATED)
    public Ticket createTicket(@RequestBody Ticket ticket) { return tickets.save(ticket); }
    @PutMapping("/tickets/{id}") public Ticket updateTicket(@PathVariable String id, @RequestBody Ticket ticket) { ticket.ticketId = id; return tickets.save(ticket); }
    @DeleteMapping("/tickets/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTicket(@PathVariable String id) { tickets.deleteById(id); }

    @GetMapping("/payments") public List<Payment> payments() { return payments.findAll(); }
    @PostMapping("/payments") @ResponseStatus(HttpStatus.CREATED)
    public Payment createPayment(@RequestBody Payment payment) { return payments.save(payment); }

    @GetMapping("/trains") public List<Train> trains() { return trains.findAll(); }
    @PostMapping("/trains") @ResponseStatus(HttpStatus.CREATED)
    public Train createTrain(@RequestBody Train train) { return trains.save(train); }
    @PutMapping("/trains/{id}") public Train updateTrain(@PathVariable String id, @RequestBody Train train) { train.trainId = id; return trains.save(train); }
    @DeleteMapping("/trains/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTrain(@PathVariable String id) { trains.deleteById(id); }

    @GetMapping("/schedules") public List<Schedule> schedules() { return schedules.findAll(); }
    @PostMapping("/schedules") @ResponseStatus(HttpStatus.CREATED)
    public Schedule createSchedule(@RequestBody Schedule schedule) { return schedules.save(schedule); }
    @PutMapping("/schedules/{id}") public Schedule updateSchedule(@PathVariable String id, @RequestBody Schedule schedule) { schedule.scheduleId = id; return schedules.save(schedule); }
    @DeleteMapping("/schedules/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteSchedule(@PathVariable String id) { schedules.deleteById(id); }

    @GetMapping("/metro-cards") public List<MetroCard> metroCards() { return metroCards.findAll(); }
    @PostMapping("/metro-cards") @ResponseStatus(HttpStatus.CREATED)
    public MetroCard createMetroCard(@RequestBody MetroCard card) { return metroCards.save(card); }
    @PutMapping("/metro-cards/{id}") public MetroCard updateMetroCard(@PathVariable String id, @RequestBody MetroCard card) { card.cardId = id; return metroCards.save(card); }
    @DeleteMapping("/metro-cards/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMetroCard(@PathVariable String id) { metroCards.deleteById(id); }

    @GetMapping("/route-stations") public List<RouteStation> routeStations() { return routeStations.findAll(); }
    @GetMapping("/routes/{routeId}/stations")
    public List<RouteStation> routeStationsForRoute(@PathVariable String routeId) { return routeStations.findByRouteIdOrderBySequenceNumberAsc(routeId); }
    @PostMapping("/route-stations") @ResponseStatus(HttpStatus.CREATED)
    public RouteStation createRouteStation(@RequestBody RouteStation routeStation) { return routeStations.save(routeStation); }
    @DeleteMapping("/route-stations/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteRouteStation(@PathVariable Long id) { routeStations.deleteById(id); }

    @GetMapping("/maintenance-issues") public List<MaintenanceIssue> maintenanceIssues() { return maintenanceIssues.findAll(); }
    @PostMapping("/maintenance-issues") @ResponseStatus(HttpStatus.CREATED)
    public MaintenanceIssue createMaintenanceIssue(@RequestBody MaintenanceIssue issue) { return maintenanceIssues.save(issue); }
    @PutMapping("/maintenance-issues/{id}") public MaintenanceIssue updateMaintenanceIssue(@PathVariable String id, @RequestBody MaintenanceIssue issue) { issue.issueId = id; return maintenanceIssues.save(issue); }
    @DeleteMapping("/maintenance-issues/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMaintenanceIssue(@PathVariable String id) { maintenanceIssues.deleteById(id); }

    public record LoginRequest(String userId, String password) {}
}

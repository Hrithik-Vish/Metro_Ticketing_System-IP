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
import org.springframework.transaction.annotation.Transactional;
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
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Comparator;

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

    /** One transactional demo checkout: validate the journey, calculate the fare on the server,
     *  and persist the ticket and its simulated payment together. */
    @PostMapping("/bookings")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public BookingResult createBooking(@RequestBody BookingRequest request) {
        if (request == null || blank(request.passengerId()) || blank(request.sourceStationId())
                || blank(request.destStationId())) {
            throw badRequest("Passenger, source station, and destination station are required.");
        }
        if (request.sourceStationId().equals(request.destStationId())) {
            throw badRequest("Source and destination stations must be different.");
        }
        int passengerCount = request.passengerCount() == null ? 1 : request.passengerCount();
        if (passengerCount < 1 || passengerCount > 4) {
            throw badRequest("Passenger count must be between 1 and 4.");
        }
        String ticketType = request.ticketType() == null ? "SINGLE" : request.ticketType().trim().toUpperCase();
        if (!Set.of("SINGLE", "RETURN", "DAY_PASS").contains(ticketType)) {
            throw badRequest("Choose a valid ticket type.");
        }

        User passenger = users.findById(request.passengerId())
                .orElseThrow(() -> badRequest("The selected passenger does not exist."));
        if (!passenger.isActive || "ADMIN".equalsIgnoreCase(passenger.role)) {
            throw badRequest("Choose an active passenger account.");
        }
        Station source = stations.findById(request.sourceStationId())
                .orElseThrow(() -> badRequest("The source station does not exist."));
        Station destination = stations.findById(request.destStationId())
                .orElseThrow(() -> badRequest("The destination station does not exist."));
        if (!source.isActive || !destination.isActive) {
            throw badRequest("Both stations must be open to book a journey.");
        }

        List<PathEdge> path = shortestPath(source.stationId, destination.stationId);
        if (path.isEmpty()) {
            throw badRequest("No connected metro route exists between these stations.");
        }

        Fare directFare = findFare(source.stationId, destination.stationId);
        Fare fareReference = directFare != null && directFare.baseFare != null
                && directFare.baseFare.compareTo(BigDecimal.ZERO) > 0 ? directFare : null;
        BigDecimal oneWayFare;
        if (fareReference != null) {
            oneWayFare = fareReference.baseFare;
        } else {
            oneWayFare = BigDecimal.ZERO;
            for (PathEdge edge : path) {
                Fare edgeFare = findFare(edge.fromStationId(), edge.toStationId());
                if (edgeFare == null || edgeFare.baseFare == null || edgeFare.baseFare.compareTo(BigDecimal.ZERO) <= 0) {
                    throw badRequest("A fare is missing for part of this journey. Please contact the metro administrator.");
                }
                oneWayFare = oneWayFare.add(edgeFare.baseFare);
                if (fareReference == null) fareReference = edgeFare;
            }
        }
        BigDecimal multiplier = switch (ticketType) {
            case "RETURN" -> BigDecimal.valueOf(2);
            case "DAY_PASS" -> BigDecimal.valueOf(3);
            default -> BigDecimal.ONE;
        };
        BigDecimal unitFare = oneWayFare.multiply(multiplier);
        BigDecimal total = unitFare.multiply(BigDecimal.valueOf(passengerCount)).setScale(2, java.math.RoundingMode.HALF_UP);
        LocalDateTime now = LocalDateTime.now();

        Ticket ticket = new Ticket();
        ticket.ticketId = uniqueId("T-", tickets::existsById);
        ticket.passengerId = passenger.userId;
        ticket.fareId = fareReference == null ? null : fareReference.fareId;
        ticket.sourceStationId = source.stationId;
        ticket.destStationId = destination.stationId;
        ticket.ticketType = ticketType;
        ticket.passengerCount = passengerCount;
        ticket.issueTime = now;
        ticket.createdAt = now;
        ticket.validUntil = switch (ticketType) {
            case "RETURN" -> now.plusHours(24);
            case "DAY_PASS" -> now.toLocalDate().atTime(23, 59, 59);
            default -> now.plusHours(2);
        };
        ticket.isUsed = false;
        Ticket savedTicket = tickets.save(ticket);

        Payment payment = new Payment();
        payment.paymentId = uniqueId("P-", payments::existsById);
        payment.ticketId = savedTicket.ticketId;
        payment.amount = total;
        payment.createdAt = now;
        Payment savedPayment = payments.save(payment);
        return new BookingResult(savedTicket, savedPayment, total);
    }

    private boolean blank(String value) { return value == null || value.isBlank(); }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private String uniqueId(String prefix, java.util.function.Predicate<String> exists) {
        String candidate;
        do {
            candidate = prefix + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        } while (exists.test(candidate));
        return candidate;
    }

    /** Finds an explicitly configured fare; the demo treats fares as symmetric if only one direction exists. */
    private Fare findFare(String from, String to) {
        return fares.findAll().stream()
                .filter(f -> from.equals(f.sourceStationId) && to.equals(f.destStationId))
                .findFirst()
                .orElseGet(() -> fares.findAll().stream()
                        .filter(f -> to.equals(f.sourceStationId) && from.equals(f.destStationId))
                        .findFirst().orElse(null));
    }

    /** Breadth-first route planning over adjacent stops, returning edges in source-to-destination order. */
    private List<PathEdge> shortestPath(String from, String to) {
        Map<String, List<PathEdge>> graph = new HashMap<>();
        Set<String> activeStationIds = stations.findAll().stream()
                .filter(station -> station.isActive)
                .map(station -> station.stationId)
                .collect(java.util.stream.Collectors.toSet());
        for (Route route : routes.findAll()) {
            List<RouteStation> stops = routeStations.findByRouteIdOrderBySequenceNumberAsc(route.routeId);
            stops.sort(Comparator.comparing(rs -> rs.sequenceNumber == null ? Integer.MAX_VALUE : rs.sequenceNumber));
            for (int i = 1; i < stops.size(); i++) {
                String a = stops.get(i - 1).stationId;
                String b = stops.get(i).stationId;
                if (blank(a) || blank(b) || a.equals(b)
                        || !activeStationIds.contains(a) || !activeStationIds.contains(b)) continue;
                graph.computeIfAbsent(a, key -> new ArrayList<>()).add(new PathEdge(a, b, route.routeId));
                graph.computeIfAbsent(b, key -> new ArrayList<>()).add(new PathEdge(b, a, route.routeId));
            }
        }
        ArrayDeque<String> queue = new ArrayDeque<>();
        Map<String, PathEdge> previous = new HashMap<>();
        Set<String> visited = new HashSet<>();
        queue.add(from);
        visited.add(from);
        while (!queue.isEmpty()) {
            String current = queue.removeFirst();
            if (current.equals(to)) break;
            for (PathEdge edge : graph.getOrDefault(current, List.of())) {
                if (visited.add(edge.toStationId())) {
                    previous.put(edge.toStationId(), edge);
                    queue.addLast(edge.toStationId());
                }
            }
        }
        if (!visited.contains(to)) return List.of();
        List<PathEdge> reversed = new ArrayList<>();
        String current = to;
        while (!current.equals(from)) {
            PathEdge edge = previous.get(current);
            if (edge == null) return List.of();
            reversed.add(edge);
            current = edge.fromStationId();
        }
        java.util.Collections.reverse(reversed);
        return reversed;
    }

    @GetMapping("/users/{id}/tickets")
    public List<Ticket> ticketsForUser(@PathVariable String id) {
        return tickets.findByPassengerId(id);
    }

    @GetMapping("/users") public List<User> users() { return users.findAll(); }
    @PostMapping("/users") @ResponseStatus(HttpStatus.CREATED)
    public User createUser(@RequestBody User user) { return users.save(user); }
    @PutMapping("/users/{id}")
    public User updateUser(@PathVariable String id, @RequestBody User user) {
        User existing = users.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
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
    @Transactional
    public void deleteTicket(@PathVariable String id) {
        payments.deleteAll(payments.findByTicketId(id));
        tickets.deleteById(id);
    }

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

    /** Insert a stop before the current terminal station while preserving ordered endpoints. */
    @PostMapping("/routes/{routeId}/stops")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public RouteStation insertRouteStop(@PathVariable String routeId, @RequestBody RouteStopRequest request) {
        if (!routes.existsById(routeId)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Route not found");
        if (request == null || blank(request.stationId()) || request.sequenceNumber() == null) {
            throw badRequest("Station and insertion sequence are required.");
        }
        Station station = stations.findById(request.stationId())
                .orElseThrow(() -> badRequest("Station not found."));
        if (!station.isActive) throw badRequest("A closed station cannot be added to a route.");
        List<RouteStation> stops = routeStations.findByRouteIdOrderBySequenceNumberAsc(routeId);
        stops.sort(Comparator.comparing(item -> item.sequenceNumber == null ? Integer.MAX_VALUE : item.sequenceNumber));
        if (stops.stream().anyMatch(item -> request.stationId().equals(item.stationId))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This station is already on the route.");
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
    @DeleteMapping("/routes/{routeId}/stops/{stopId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void deleteRouteStop(@PathVariable String routeId, @PathVariable Long stopId) {
        List<RouteStation> stops = routeStations.findByRouteIdOrderBySequenceNumberAsc(routeId);
        stops.sort(Comparator.comparing(item -> item.sequenceNumber == null ? Integer.MAX_VALUE : item.sequenceNumber));
        int index = -1;
        for (int i = 0; i < stops.size(); i++) {
            if (stops.get(i).id.equals(stopId)) { index = i; break; }
        }
        if (index < 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Route stop not found");
        if (stops.size() <= 2 || index == 0 || index == stops.size() - 1) {
            throw badRequest("Route endpoints must remain in place; only intermediate stops can be removed.");
        }
        routeStations.deleteById(stopId);
        stops.remove(index);
        for (int i = 0; i < stops.size(); i++) stops.get(i).sequenceNumber = i + 1;
        routeStations.saveAll(stops);
    }

    @GetMapping("/maintenance-issues") public List<MaintenanceIssue> maintenanceIssues() { return maintenanceIssues.findAll(); }
    @PostMapping("/maintenance-issues") @ResponseStatus(HttpStatus.CREATED)
    public MaintenanceIssue createMaintenanceIssue(@RequestBody MaintenanceIssue issue) { return maintenanceIssues.save(issue); }
    @PutMapping("/maintenance-issues/{id}") public MaintenanceIssue updateMaintenanceIssue(@PathVariable String id, @RequestBody MaintenanceIssue issue) { issue.issueId = id; return maintenanceIssues.save(issue); }
    @DeleteMapping("/maintenance-issues/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMaintenanceIssue(@PathVariable String id) { maintenanceIssues.deleteById(id); }

    public record LoginRequest(String userId, String password) {}
    public record BookingRequest(String passengerId, String sourceStationId, String destStationId,
                                 String ticketType, Integer passengerCount) {}
    public record BookingResult(Ticket ticket, Payment payment, BigDecimal amount) {}
    public record RouteStopRequest(String stationId, Integer sequenceNumber) {}
    private record PathEdge(String fromStationId, String toStationId, String routeId) {}
}

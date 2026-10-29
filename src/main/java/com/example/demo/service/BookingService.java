package com.example.demo.service;

import static com.example.demo.exception.Errors.badRequest;
import static com.example.demo.exception.Errors.blank;

import com.example.demo.dto.BookingRequest;
import com.example.demo.dto.BookingResult;
import com.example.demo.entity.Fare;
import com.example.demo.entity.MetroCard;
import com.example.demo.entity.Payment;
import com.example.demo.entity.Route;
import com.example.demo.entity.RouteStation;
import com.example.demo.entity.Station;
import com.example.demo.entity.Ticket;
import com.example.demo.entity.User;
import com.example.demo.repository.FareRepository;
import com.example.demo.repository.MetroCardRepository;
import com.example.demo.repository.PaymentRepository;
import com.example.demo.repository.RouteRepository;
import com.example.demo.repository.RouteStationRepository;
import com.example.demo.repository.StationRepository;
import com.example.demo.repository.TicketRepository;
import com.example.demo.repository.UserRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BookingService {

    private final UserRepository users;
    private final StationRepository stations;
    private final RouteRepository routes;
    private final RouteStationRepository routeStations;
    private final FareRepository fares;
    private final TicketRepository tickets;
    private final PaymentRepository payments;
    private final MetroCardRepository metroCards;

    public BookingService(UserRepository users, StationRepository stations, RouteRepository routes,
                          RouteStationRepository routeStations, FareRepository fares, TicketRepository tickets,
                          PaymentRepository payments, MetroCardRepository metroCards) {
        this.users = users;
        this.stations = stations;
        this.routes = routes;
        this.routeStations = routeStations;
        this.fares = fares;
        this.tickets = tickets;
        this.payments = payments;
        this.metroCards = metroCards;
    }

    /** One transactional checkout: validate the journey, calculate the fare on the server, optionally charge the
     *  passenger's metro card, and persist the ticket and its payment together (all or nothing). */
    @Transactional
    public BookingResult createBooking(BookingRequest request) {
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
        String paymentMethod = blank(request.paymentMethod()) ? "DEMO" : request.paymentMethod().trim().toUpperCase();
        if (!Set.of("DEMO", "METRO_CARD").contains(paymentMethod)) {
            throw badRequest("Payment method must be DEMO or METRO_CARD.");
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

        MetroCard payingCard = null;
        if ("METRO_CARD".equals(paymentMethod)) {
            List<MetroCard> activeCards = metroCards.findActiveCardsForUpdate(passenger.userId);
            if (activeCards.isEmpty()) {
                throw badRequest("This passenger has no active metro card. Pay with the demo checkout or ask an admin to issue a card.");
            }
            payingCard = activeCards.get(0);
            if (payingCard.expiryDate != null && payingCard.expiryDate.isBefore(LocalDate.now())) {
                throw badRequest("Metro card " + payingCard.cardId + " expired on " + payingCard.expiryDate + ".");
            }
            BigDecimal available = payingCard.balance == null ? BigDecimal.ZERO : payingCard.balance;
            if (available.compareTo(total) < 0) {
                throw badRequest("Insufficient metro card balance: " + available.setScale(2, java.math.RoundingMode.HALF_UP)
                        + " available, " + total + " needed. Top up the card and try again.");
            }
            payingCard.balance = available.subtract(total);
            metroCards.save(payingCard);
        }

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
        payment.paymentMethod = paymentMethod;
        payment.metroCardId = payingCard == null ? null : payingCard.cardId;
        Payment savedPayment = payments.save(payment);
        return new BookingResult(savedTicket, savedPayment, total, payingCard == null ? null : payingCard.balance);
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

    private record PathEdge(String fromStationId, String toStationId, String routeId) {}
}

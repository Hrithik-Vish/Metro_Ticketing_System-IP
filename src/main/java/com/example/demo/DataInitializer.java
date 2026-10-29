package com.example.demo;

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
import com.example.demo.service.PasswordService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.DayOfWeek;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Component
public class DataInitializer implements CommandLineRunner {
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
    private final PasswordService passwords;

    public DataInitializer(UserRepository users, StationRepository stations, RouteRepository routes,
                           FareRepository fares, TicketRepository tickets, PaymentRepository payments,
                           TrainRepository trains, ScheduleRepository schedules, MetroCardRepository metroCards,
                           RouteStationRepository routeStations, MaintenanceIssueRepository maintenanceIssues,
                           PasswordService passwords) {
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
        this.passwords = passwords;
    }

    @Override
    public void run(String... args) {
        passwords.hashLegacyPasswords();
        boolean freshDatabase = users.count() == 0 && stations.count() == 0 && routes.count() == 0
                && fares.count() == 0 && tickets.count() == 0 && payments.count() == 0
                && trains.count() == 0 && schedules.count() == 0 && metroCards.count() == 0
                && routeStations.count() == 0 && maintenanceIssues.count() == 0;
        seedUsers();
        seedNetwork();
        seedTrains();
        seedRouteStations();
        ensureDemoGreenInterchange();
        seedSchedules();
        ensureDemoWeeklySchedules();
        if (freshDatabase) seedTickets();
        seedMetroCards();
        seedMaintenanceIssues();
    }

    private void seedUsers() {
        if (users.count() > 0) return;
        users.save(user("admin", "Metro", "Admin", "admin123", "ADMIN", "admin@metro.local", "ST-CEN"));
        users.save(user("rider1", "Aarav", "Mehta", "rider123", "USER", "aarav@example.com", null));
        users.save(user("rider2", "Mira", "Shah", "rider123", "USER", "mira@example.com", null));
        users.save(user("operator1", "Neha", "Rao", "operator123", "ADMIN", "neha@metro.local", "ST-AIR"));
    }

    private void seedNetwork() {
        if (stations.count() == 0) {
            stations.save(station("ST-CEN", "Central", "City Center", "#2f80ed", 28.6139f, 77.2090f));
            stations.save(station("ST-UNI", "University", "North Campus", "#2f80ed", 28.6870f, 77.2090f));
            stations.save(station("ST-MKT", "Market", "Civic Market", "#f2994a", 28.6304f, 77.2177f));
            stations.save(station("ST-AIR", "Airport", "Terminal Gateway", "#27ae60", 28.5562f, 77.1000f));
            stations.save(station("ST-RIV", "Riverside", "River Walk", "#bb6bd9", 28.6100f, 77.2400f));
        }

        if (routes.count() == 0) {
            routes.save(route("RT-BLUE", "Blue Line", "ST-UNI", "ST-CEN", "#2f80ed", "18.5", 34));
            routes.save(route("RT-ORANGE", "Airport Express", "ST-CEN", "ST-AIR", "#f2994a", "22.0", 28));
            routes.save(route("RT-GREEN", "River Connector", "ST-MKT", "ST-RIV", "#27ae60", "9.8", 16));
        }

        if (fares.count() == 0) {
            fare("FR-01", "ST-CEN", "ST-UNI", "25.00");
            fare("FR-02", "ST-CEN", "ST-MKT", "18.00");
            fare("FR-03", "ST-CEN", "ST-AIR", "60.00");
            fare("FR-04", "ST-MKT", "ST-RIV", "22.00");
            fare("FR-05", "ST-UNI", "ST-AIR", "70.00");
            fare("FR-06", "ST-RIV", "ST-CEN", "28.00");
        }
    }

    private void seedTickets() {
        if (tickets.count() > 0) return;
        LocalDateTime now = LocalDateTime.now();
        Ticket ticket = new Ticket();
        ticket.ticketId = "T-DEMO-01";
        ticket.passengerId = "rider1";
        ticket.fareId = "FR-01";
        ticket.sourceStationId = "ST-CEN";
        ticket.destStationId = "ST-UNI";
        ticket.ticketType = "SINGLE";
        ticket.issueTime = now.minusHours(2);
        ticket.createdAt = ticket.issueTime;
        ticket.validUntil = now.plusHours(22);
        ticket.isUsed = false;
        tickets.save(ticket);

        Payment payment = new Payment();
        payment.paymentId = "P-DEMO-01";
        payment.ticketId = ticket.ticketId;
        payment.amount = new BigDecimal("25.00");
        payment.createdAt = ticket.createdAt;
        payments.save(payment);
    }

    private void seedTrains() {
        if (trains.count() > 0) return;
        train("TR-101", "101", 1200, 6, 2019);
        train("TR-102", "102", 1200, 6, 2020);
        train("TR-103", "103", 900, 4, 2022);
    }

    private void seedRouteStations() {
        if (routeStations.count() > 0) return;
        routeStation("RT-BLUE", "ST-UNI", 1);
        routeStation("RT-BLUE", "ST-CEN", 2);
        routeStation("RT-ORANGE", "ST-CEN", 1);
        routeStation("RT-ORANGE", "ST-AIR", 2);
        routeStation("RT-GREEN", "ST-MKT", 1);
        routeStation("RT-GREEN", "ST-RIV", 2);
    }

    private void ensureDemoGreenInterchange() {
        Route green = routes.findById("RT-GREEN").orElse(null);
        if (green == null || !"River Connector".equals(green.routeName)
                || !stations.existsById("ST-CEN") || !stations.existsById("ST-MKT")
                || !stations.existsById("ST-RIV")) return;
        List<RouteStation> stops = routeStations.findByRouteIdOrderBySequenceNumberAsc("RT-GREEN");
        if (stops.stream().anyMatch(stop -> "ST-CEN".equals(stop.stationId))) return;
        boolean matchesSeedNetwork = stops.stream().anyMatch(stop -> "ST-MKT".equals(stop.stationId))
                && stops.stream().anyMatch(stop -> "ST-RIV".equals(stop.stationId))
                && stops.size() == 2;
        if (!matchesSeedNetwork) return;
        for (RouteStation stop : stops) {
            if (stop.sequenceNumber != null && stop.sequenceNumber >= 2) stop.sequenceNumber++;
        }
        routeStations.saveAll(stops);
        routeStation("RT-GREEN", "ST-CEN", 2);
    }

    private void seedSchedules() {
        if (schedules.count() > 0) return;
        LocalDate today = LocalDate.now();
        seedSchedule("SCH-01", "TR-101", "RT-BLUE", DayOfWeek.MONDAY, today, 7);
        seedSchedule("SCH-02", "TR-102", "RT-ORANGE", DayOfWeek.MONDAY, today, 8);
        seedSchedule("SCH-03", "TR-103", "RT-GREEN", DayOfWeek.MONDAY, today, 9);
    }

    /** Legacy demo databases contain one Monday run per route. Add the missing weekdays once,
     *  but do not rewrite a database that already contains custom timetable entries. */
    private void ensureDemoWeeklySchedules() {
        List<Schedule> existing = schedules.findAll();
        Set<String> knownIds = Set.of("SCH-01", "SCH-02", "SCH-03");
        // Only migrate the exact original three-route demo timetable; do not recreate
        // schedules on a database where an operator has deliberately removed seed rows.
        if (existing.size() != 3 || existing.stream().anyMatch(s -> !knownIds.contains(s.scheduleId))) return;
        LocalDate today = LocalDate.now();
        for (DayOfWeek day : DayOfWeek.values()) {
            ensureSchedule("RT-BLUE", "TR-101", day, today, 7);
            ensureSchedule("RT-ORANGE", "TR-102", day, today, 8);
            ensureSchedule("RT-GREEN", "TR-103", day, today, 9);
        }
    }

    private void ensureSchedule(String routeId, String trainId, DayOfWeek day, LocalDate today, int hour) {
        boolean exists = schedules.findAll().stream().anyMatch(s -> routeId.equals(s.routeId)
                && day.name().equalsIgnoreCase(s.dayOfWeek));
        if (exists) return;
        String routeToken = routeId.replace("RT-", "");
        String id = "SCH-" + routeToken + "-" + day.name();
        if (schedules.existsById(id)) return;
        seedSchedule(id, trainId, routeId, day, today, hour);
    }

    private void seedSchedule(String id, String trainId, String routeId, DayOfWeek day, LocalDate today, int hour) {
        LocalDate departureDate = today.with(java.time.temporal.TemporalAdjusters.nextOrSame(day));
        LocalDateTime departure = departureDate.atTime(hour, 0);
        schedule(id, trainId, routeId, day.name(), departure, departure.plusMinutes(
                routes.findById(routeId).map(route -> route.estimatedTime == null ? 20 : route.estimatedTime).orElse(20)));
    }

    private void seedMetroCards() {
        if (metroCards.count() > 0) return;
        metroCard("MC-1001", "rider1", "500.00");
        metroCard("MC-1002", "rider2", "150.00");
    }

    private void seedMaintenanceIssues() {
        if (maintenanceIssues.count() > 0) return;
        MaintenanceIssue issue = new MaintenanceIssue();
        issue.issueId = "MI-01";
        issue.trainId = "TR-103";
        issue.stationId = "ST-MKT";
        issue.reportedBy = "operator1";
        issue.issueType = "Door sensor fault";
        issue.description = "Door sensor on coach 2 intermittently failing to close.";
        issue.status = "OPEN";
        issue.priority = "MEDIUM";
        issue.createdAt = LocalDateTime.now().minusDays(1);
        maintenanceIssues.save(issue);
    }

    private void train(String id, String number, int capacity, int coaches, int year) {
        Train train = new Train();
        train.trainId = id;
        train.trainNumber = number;
        train.capacity = capacity;
        train.totalCoaches = coaches;
        train.manufactureYear = year;
        train.createdAt = LocalDateTime.now();
        train.isActive = true;
        trains.save(train);
    }

    private void routeStation(String routeId, String stationId, int sequence) {
        RouteStation routeStation = new RouteStation();
        routeStation.routeId = routeId;
        routeStation.stationId = stationId;
        routeStation.sequenceNumber = sequence;
        routeStations.save(routeStation);
    }

    private void schedule(String id, String trainId, String routeId, String day, LocalDateTime departure, LocalDateTime arrival) {
        Schedule schedule = new Schedule();
        schedule.scheduleId = id;
        schedule.trainId = trainId;
        schedule.routeId = routeId;
        schedule.dayOfWeek = day;
        schedule.scheduledDeparture = departure;
        schedule.scheduledArrival = arrival;
        schedule.validFrom = LocalDate.now();
        schedule.validTo = LocalDate.now().plusMonths(6);
        schedule.isActive = true;
        schedule.createdAt = LocalDateTime.now();
        schedules.save(schedule);
    }

    private void metroCard(String id, String passengerId, String balance) {
        MetroCard card = new MetroCard();
        card.cardId = id;
        card.passengerId = passengerId;
        card.balance = new BigDecimal(balance);
        card.issueDate = LocalDate.now().minusMonths(2);
        card.expiryDate = LocalDate.now().plusYears(3);
        card.createdAt = LocalDateTime.now();
        card.isActive = true;
        metroCards.save(card);
    }

    private User user(String id, String first, String last, String password, String role, String contact, String stationId) {
        User user = new User();
        user.userId = id;
        user.firstName = first;
        user.lastName = last;
        user.password = passwords.hash(password);
        user.role = role;
        user.contact = contact;
        user.registrationDate = LocalDate.now();
        user.isActive = true;
        user.hireDate = "ADMIN".equals(role) ? LocalDate.now().minusYears(1) : null;
        user.stationId = stationId;
        return user;
    }

    private Station station(String id, String code, String address, String color, Float latitude, Float longitude) {
        Station station = new Station();
        station.stationId = id;
        station.stationCode = code;
        station.address = address;
        station.lineColor = color;
        station.latitude = latitude;
        station.longitude = longitude;
        station.openedDate = LocalDate.now().minusYears(3);
        station.isActive = true;
        return station;
    }

    private Route route(String id, String name, String start, String end, String color, String distance, Integer time) {
        Route route = new Route();
        route.routeId = id;
        route.routeName = name;
        route.startStationId = start;
        route.endStationId = end;
        route.lineColor = color;
        route.totalDistance = new BigDecimal(distance);
        route.estimatedTime = time;
        route.createdAt = LocalDateTime.now();
        route.updatedAt = route.createdAt;
        return route;
    }

    private void fare(String id, String source, String destination, String amount) {
        Fare fare = new Fare();
        fare.fareId = id;
        fare.sourceStationId = source;
        fare.destStationId = destination;
        fare.baseFare = new BigDecimal(amount);
        fares.save(fare);
    }
}

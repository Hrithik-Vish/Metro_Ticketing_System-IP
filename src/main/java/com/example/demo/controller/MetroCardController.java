package com.example.demo.controller;

import com.example.demo.dto.MetroCardCreateRequest;
import com.example.demo.dto.MetroCardPatchRequest;
import com.example.demo.dto.MetroCardReplaceRequest;
import com.example.demo.dto.MetroCardTopUpRequest;
import com.example.demo.entity.MetroCard;
import com.example.demo.entity.MetroCardPass;
import com.example.demo.entity.MetroCardTransaction;
import com.example.demo.repository.MetroCardRepository;
import com.example.demo.repository.MetroCardPassRepository;
import com.example.demo.repository.MetroCardTransactionRepository;
import com.example.demo.repository.UserRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/metro-cards")
@Tag(name = "Metro Cards", description = "Stored-value metro cards issued to passengers")
public class MetroCardController {

    private final MetroCardRepository metroCards;
    private final UserRepository users;
    private final MetroCardPassRepository passes;
    private final MetroCardTransactionRepository transactions;

    public MetroCardController(MetroCardRepository metroCards, UserRepository users,
                               MetroCardPassRepository passes, MetroCardTransactionRepository transactions) {
        this.metroCards = metroCards;
        this.users = users;
        this.passes = passes;
        this.transactions = transactions;
    }

    // ---------- helpers ----------

    private MetroCard find(String id) {
        return metroCards.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Metro card not found: " + id));
    }

    private void requirePassengerExists(String passengerId) {
        if (!users.existsById(passengerId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Passenger not found: " + passengerId);
        }
    }

    private void requireValidDates(LocalDate issueDate, LocalDate expiryDate) {
        if (issueDate != null && expiryDate != null && !expiryDate.isAfter(issueDate)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "expiryDate must be after issueDate");
        }
    }

    private void requireNoOtherActiveCard(String passengerId, String cardId) {
        if (metroCards.countOtherActiveCards(passengerId, cardId) > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Passenger " + passengerId + " already has an active metro card");
        }
    }

    // ---------- endpoints ----------

    @GetMapping
    @Operation(summary = "List all metro cards")
    @ApiResponse(responseCode = "200", description = "All cards")
    public List<MetroCard> getAll() {
        return metroCards.findAll();
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get one metro card by ID")
    @ApiResponse(responseCode = "200", description = "Card found")
    @ApiResponse(responseCode = "404", description = "Card not found", content = @Content)
    public MetroCard getOne(@Parameter(description = "Card ID", example = "MC-1001") @PathVariable String id) {
        return find(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    @Operation(summary = "Issue a new metro card")
    @ApiResponse(responseCode = "201", description = "Card issued")
    @ApiResponse(responseCode = "400", description = "Invalid input or unknown passenger", content = @Content)
    @ApiResponse(responseCode = "409", description = "Card ID already exists, or the passenger already has an active card", content = @Content)
    public MetroCard create(@Valid @RequestBody MetroCardCreateRequest request) {
        String id = request.cardId.trim();
        if (metroCards.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Metro card already exists: " + id);
        }
        requirePassengerExists(request.passengerId);

        LocalDate issueDate = request.issueDate != null ? request.issueDate : LocalDate.now();
        LocalDate expiryDate = request.expiryDate != null ? request.expiryDate : issueDate.plusYears(3);
        requireValidDates(issueDate, expiryDate);

        boolean active = request.isActive == null || request.isActive;
        if (active) {
            requireNoOtherActiveCard(request.passengerId, id);
        }

        MetroCard card = new MetroCard();
        card.cardId = id;
        card.passengerId = request.passengerId;
        card.balance = request.balance;
        card.issueDate = issueDate;
        card.expiryDate = expiryDate;
        card.createdAt = LocalDateTime.now();
        card.isActive = active;
        return metroCards.save(card);
    }

    @PutMapping("/{id}")
    @Transactional
    @Operation(summary = "Replace a metro card (full update)",
            description = "Replaces every editable field. Use PATCH to change only some fields.")
    @ApiResponse(responseCode = "200", description = "Card replaced")
    @ApiResponse(responseCode = "400", description = "Invalid input or unknown passenger", content = @Content)
    @ApiResponse(responseCode = "404", description = "Card not found", content = @Content)
    @ApiResponse(responseCode = "409", description = "The passenger already has another active card", content = @Content)
    public MetroCard replace(@Parameter(description = "Card ID", example = "MC-1001") @PathVariable String id,
                             @Valid @RequestBody MetroCardReplaceRequest request) {
        MetroCard card = find(id);
        requirePassengerExists(request.passengerId);
        requireValidDates(request.issueDate, request.expiryDate);
        if (request.isActive) {
            requireNoOtherActiveCard(request.passengerId, id);
        }

        card.passengerId = request.passengerId;
        card.balance = request.balance;
        card.issueDate = request.issueDate;
        card.expiryDate = request.expiryDate;
        card.isActive = request.isActive;
        return metroCards.save(card);
    }

    @PatchMapping("/{id}")
    @Transactional
    @Operation(summary = "Partially update a metro card",
            description = "Send only the fields you want to change. Fields you leave out stay as they are.",
            requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    content = @Content(mediaType = "application/json", examples = {
                            @ExampleObject(name = "Top up balance", value = "{\"balance\": 750.00}"),
                            @ExampleObject(name = "Deactivate card", value = "{\"isActive\": false}"),
                            @ExampleObject(name = "Extend expiry", value = "{\"expiryDate\": \"2030-12-31\"}")
                    })))
    @ApiResponse(responseCode = "200", description = "Card updated")
    @ApiResponse(responseCode = "400", description = "Invalid input or unknown passenger", content = @Content)
    @ApiResponse(responseCode = "404", description = "Card not found", content = @Content)
    @ApiResponse(responseCode = "409", description = "The passenger already has another active card", content = @Content)
    public MetroCard patch(@Parameter(description = "Card ID", example = "MC-1001") @PathVariable String id,
                           @Valid @RequestBody MetroCardPatchRequest request) {
        MetroCard card = find(id);
        boolean ownerChanged = false;
        boolean activationChanged = false;

        if (request.passengerId != null) {
            if (request.passengerId.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "passengerId must not be blank");
            }
            if (!request.passengerId.equals(card.passengerId)) {
                requirePassengerExists(request.passengerId);
                card.passengerId = request.passengerId;
                ownerChanged = true;
            }
        }
        if (request.balance != null) card.balance = request.balance;
        if (request.issueDate != null) card.issueDate = request.issueDate;
        if (request.expiryDate != null) card.expiryDate = request.expiryDate;
        if (request.isActive != null) {
            activationChanged = request.isActive != card.isActive;
            card.isActive = request.isActive;
        }

        requireValidDates(card.issueDate, card.expiryDate);
        if (card.isActive && (ownerChanged || activationChanged)) {
            requireNoOtherActiveCard(card.passengerId, id);
        }
        return metroCards.save(card);
    }

    @PostMapping("/{id}/top-up")
    @Transactional
    @Operation(summary = "Top up a metro card",
            description = "Adds the given amount to the card balance. The card must be active and not expired.")
    @ApiResponse(responseCode = "200", description = "Balance increased; the updated card is returned")
    @ApiResponse(responseCode = "400", description = "Invalid amount", content = @Content)
    @ApiResponse(responseCode = "404", description = "Card not found", content = @Content)
    @ApiResponse(responseCode = "409", description = "Card is inactive or expired", content = @Content)
    public MetroCard topUp(@Parameter(description = "Card ID", example = "MC-1001") @PathVariable String id,
                           @Valid @RequestBody MetroCardTopUpRequest request) {
        MetroCard card = metroCards.findByIdForUpdate(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Metro card not found: " + id));
        if (!card.isActive) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Metro card " + id + " is inactive");
        }
        if (card.expiryDate != null && card.expiryDate.isBefore(LocalDate.now())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Metro card " + id + " has expired");
        }
        BigDecimal current = card.balance == null ? BigDecimal.ZERO : card.balance;
        card.balance = current.add(request.amount);
        MetroCard updated = metroCards.save(card);
        recordTransaction(card, "TOP_UP", "Wallet top-up", request.amount, card.balance);
        return updated;
    }

    @GetMapping("/{id}/passes")
    @Operation(summary = "List pass purchases and validity for a metro card")
    public List<MetroCardPass> getPasses(@PathVariable String id) {
        find(id);
        return passes.findByCardIdOrderByCreatedAtDesc(id);
    }

    @GetMapping("/{id}/transactions")
    @Operation(summary = "List recent wallet activity for a metro card")
    public List<MetroCardTransaction> getTransactions(@PathVariable String id) {
        find(id);
        return transactions.findTop20ByCardIdOrderByCreatedAtDesc(id);
    }

    @PostMapping("/{id}/passes")
    @Transactional
    @Operation(summary = "Buy a time-based unlimited travel pass using the metro card balance")
    public PassPurchaseResult buyPass(@PathVariable String id, @RequestBody PassPurchaseRequest request) {
        MetroCard card = metroCards.findByIdForUpdate(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Metro card not found: " + id));
        if (!card.isActive || (card.expiryDate != null && card.expiryDate.isBefore(LocalDate.now()))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only an active, unexpired card can buy a pass");
        }
        PassPlan plan = PassPlan.forType(request == null ? null : request.passType());
        if (plan == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a valid travel pass");
        BigDecimal balance = card.balance == null ? BigDecimal.ZERO : card.balance;
        if (balance.compareTo(plan.price) < 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Insufficient balance. Top up " + plan.price.subtract(balance).setScale(2) + " more to buy this pass.");
        }
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime startsAt = passes.findCurrentOrUpcomingByCardId(id, now)
                .map(existing -> existing.expiresAt.isAfter(now) ? existing.expiresAt : now).orElse(now);
        LocalDateTime expiresAt = startsAt.plusHours(plan.hours);
        card.balance = balance.subtract(plan.price);
        metroCards.save(card);
        MetroCardPass pass = new MetroCardPass();
        pass.passId = "MP-" + UUID.randomUUID().toString().substring(0, 12).toUpperCase();
        pass.cardId = id;
        pass.passType = plan.type;
        pass.price = plan.price;
        pass.startsAt = startsAt;
        pass.expiresAt = expiresAt;
        pass.createdAt = now;
        passes.save(pass);
        recordTransaction(card, "PASS_PURCHASE", plan.label + " (" + pass.passId + ")", plan.price, card.balance);
        return new PassPurchaseResult(pass, card);
    }

    private void recordTransaction(MetroCard card, String type, String description, BigDecimal amount, BigDecimal balance) {
        MetroCardTransaction transaction = new MetroCardTransaction();
        transaction.transactionId = "MT-" + UUID.randomUUID().toString().substring(0, 12).toUpperCase();
        transaction.cardId = card.cardId;
        transaction.transactionType = type;
        transaction.description = description;
        transaction.amount = amount;
        transaction.balanceAfter = balance;
        transaction.createdAt = LocalDateTime.now();
        transactions.save(transaction);
    }

    public record PassPurchaseRequest(String passType) {}
    public record PassPurchaseResult(MetroCardPass pass, MetroCard card) {}
    private record PassPlan(String type, String label, int hours, BigDecimal price) {
        static PassPlan forType(String type) {
            if (type == null) return null;
            return switch (type.trim().toUpperCase()) {
                case "DAY" -> new PassPlan("DAY", "24-hour pass", 24, new BigDecimal("120.00"));
                case "WEEK" -> new PassPlan("WEEK", "7-day pass", 168, new BigDecimal("600.00"));
                case "MONTH" -> new PassPlan("MONTH", "30-day pass", 720, new BigDecimal("1800.00"));
                default -> null;
            };
        }
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    @Operation(summary = "Delete a metro card")
    @ApiResponse(responseCode = "204", description = "Card deleted")
    @ApiResponse(responseCode = "404", description = "Card not found", content = @Content)
    public void delete(@Parameter(description = "Card ID", example = "MC-2001") @PathVariable String id) {
        metroCards.delete(find(id));
    }
}

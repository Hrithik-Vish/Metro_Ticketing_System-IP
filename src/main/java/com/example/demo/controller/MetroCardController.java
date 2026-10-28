package com.example.demo.controller;

import com.example.demo.dto.MetroCardCreateRequest;
import com.example.demo.dto.MetroCardPatchRequest;
import com.example.demo.dto.MetroCardReplaceRequest;
import com.example.demo.entity.MetroCard;
import com.example.demo.repository.MetroCardRepository;
import com.example.demo.repository.UserRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.time.LocalDateTime;
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

    public MetroCardController(MetroCardRepository metroCards, UserRepository users) {
        this.metroCards = metroCards;
        this.users = users;
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

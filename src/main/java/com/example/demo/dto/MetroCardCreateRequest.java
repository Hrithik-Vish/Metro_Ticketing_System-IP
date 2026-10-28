package com.example.demo.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;

/** Request body for issuing a new metro card (POST). */
@JsonIgnoreProperties(ignoreUnknown = true)
@Schema(description = "Details for issuing a new metro card")
public class MetroCardCreateRequest {

    @NotBlank(message = "cardId is required")
    @Size(max = 50, message = "cardId must be at most 50 characters")
    @Schema(description = "Unique card ID", example = "MC-2001")
    public String cardId;

    @NotBlank(message = "passengerId is required")
    @Schema(description = "User ID of the passenger who owns the card (must exist)", example = "rider1")
    public String passengerId;

    @NotNull(message = "balance is required")
    @DecimalMin(value = "0.00", message = "balance cannot be negative")
    @Digits(integer = 8, fraction = 2, message = "balance must have at most 2 decimal places")
    @Schema(description = "Opening balance in rupees", example = "500.00")
    public BigDecimal balance;

    @Schema(description = "Issue date (defaults to today)", example = "2026-10-29")
    public LocalDate issueDate;

    @Schema(description = "Expiry date (defaults to 3 years after the issue date)", example = "2029-10-29")
    public LocalDate expiryDate;

    @Schema(description = "Whether the card is active (defaults to true)", example = "true")
    public Boolean isActive;
}

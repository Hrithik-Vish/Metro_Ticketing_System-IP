package com.example.demo.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;

/** Request body for replacing a metro card (PUT). Every field is required. */
@JsonIgnoreProperties(ignoreUnknown = true)
@Schema(description = "Full replacement of a metro card. Every field is required; use PATCH to change only some fields.")
public class MetroCardReplaceRequest {

    @NotBlank(message = "passengerId is required")
    @Schema(description = "User ID of the passenger who owns the card (must exist)", example = "rider1")
    public String passengerId;

    @NotNull(message = "balance is required")
    @DecimalMin(value = "0.00", message = "balance cannot be negative")
    @Digits(integer = 8, fraction = 2, message = "balance must have at most 2 decimal places")
    @Schema(description = "Balance in rupees", example = "500.00")
    public BigDecimal balance;

    @NotNull(message = "issueDate is required")
    @Schema(example = "2026-10-29")
    public LocalDate issueDate;

    @NotNull(message = "expiryDate is required")
    @Schema(example = "2029-10-29")
    public LocalDate expiryDate;

    @NotNull(message = "isActive is required")
    @Schema(example = "true")
    public Boolean isActive;
}

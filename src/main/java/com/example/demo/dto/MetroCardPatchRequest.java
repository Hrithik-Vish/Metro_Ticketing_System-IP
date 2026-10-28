package com.example.demo.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import java.math.BigDecimal;
import java.time.LocalDate;

/** Request body for a partial update (PATCH). Every field is optional; only the fields sent are changed. */
@JsonIgnoreProperties(ignoreUnknown = true)
@Schema(description = "Partial update of a metro card. Send only the fields you want to change.")
public class MetroCardPatchRequest {

    @Schema(description = "New owner (must be an existing user)", example = "rider2")
    public String passengerId;

    @DecimalMin(value = "0.00", message = "balance cannot be negative")
    @Digits(integer = 8, fraction = 2, message = "balance must have at most 2 decimal places")
    @Schema(description = "New balance in rupees", example = "750.00")
    public BigDecimal balance;

    @Schema(example = "2026-10-29")
    public LocalDate issueDate;

    @Schema(example = "2030-12-31")
    public LocalDate expiryDate;

    @Schema(description = "Activate or deactivate the card", example = "false")
    public Boolean isActive;
}

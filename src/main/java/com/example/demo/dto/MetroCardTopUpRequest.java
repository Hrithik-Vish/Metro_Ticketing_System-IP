package com.example.demo.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

/** Request body for adding money to a metro card. */
@JsonIgnoreProperties(ignoreUnknown = true)
@Schema(description = "Amount to add to the card balance")
public class MetroCardTopUpRequest {

    @NotNull(message = "amount is required")
    @DecimalMin(value = "1.00", message = "amount must be at least 1.00")
    @DecimalMax(value = "10000.00", message = "amount cannot exceed 10000.00 per top-up")
    @Digits(integer = 5, fraction = 2, message = "amount must have at most 2 decimal places")
    @Schema(description = "Amount in rupees to add", example = "200.00")
    public BigDecimal amount;
}

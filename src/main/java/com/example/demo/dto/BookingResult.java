package com.example.demo.dto;

import com.example.demo.entity.Payment;
import com.example.demo.entity.Ticket;
import java.math.BigDecimal;

/** remainingCardBalance is only set when the ticket was paid with a metro card. */
public record BookingResult(Ticket ticket, Payment payment, BigDecimal amount, BigDecimal remainingCardBalance) {}

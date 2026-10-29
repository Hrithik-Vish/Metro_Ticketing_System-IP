package com.example.demo.dto;

/** paymentMethod is optional: DEMO (default, simulated checkout) or METRO_CARD (charges the passenger's active card). */
public record BookingRequest(String passengerId, String sourceStationId, String destStationId,
                             String ticketType, Integer passengerCount, String paymentMethod) {}

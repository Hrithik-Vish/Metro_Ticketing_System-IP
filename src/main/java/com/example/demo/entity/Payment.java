package com.example.demo.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "payments")
public class Payment {
    @Id public String paymentId;
    public String ticketId;
    public BigDecimal amount;
    public LocalDateTime createdAt;
    /** DEMO (simulated checkout) or METRO_CARD; null on rows created before this field existed. */
    public String paymentMethod;
    /** The card that paid, when paymentMethod is METRO_CARD. */
    public String metroCardId;
}

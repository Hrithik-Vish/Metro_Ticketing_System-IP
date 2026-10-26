package com.example.demo.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "tickets")
public class Ticket {
    @Id public String ticketId;
    public String passengerId;
    public String fareId;
    public String sourceStationId;
    public String destStationId;
    public String ticketType;
    /** Number of passengers covered by this ticket; null only on rows created before this field existed. */
    public Integer passengerCount = 1;
    public LocalDateTime validUntil;
    public boolean isUsed;
    public LocalDateTime issueTime;
    public LocalDateTime createdAt;
}

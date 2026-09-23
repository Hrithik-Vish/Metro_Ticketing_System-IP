package com.example.demo.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "maintenance_issues")
public class MaintenanceIssue {
    @Id public String issueId;
    public String trainId;
    public String stationId;
    public String reportedBy;
    public String issueType;
    public String description;
    public String status;
    public String priority;
    public LocalDateTime createdAt;
    public LocalDateTime resolvedAt;
}

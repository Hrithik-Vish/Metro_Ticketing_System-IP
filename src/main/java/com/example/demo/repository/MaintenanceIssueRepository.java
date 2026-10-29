package com.example.demo.repository;

import com.example.demo.entity.MaintenanceIssue;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MaintenanceIssueRepository extends JpaRepository<MaintenanceIssue, String> {
    boolean existsByStationId(String stationId);

    boolean existsByTrainId(String trainId);

    boolean existsByReportedBy(String reportedBy);
}

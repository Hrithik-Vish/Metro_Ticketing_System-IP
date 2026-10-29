package com.example.demo.repository;

import com.example.demo.entity.Ticket;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TicketRepository extends JpaRepository<Ticket, String> {
    List<Ticket> findByPassengerId(String passengerId);

    boolean existsByPassengerId(String passengerId);

    boolean existsByFareId(String fareId);

    boolean existsBySourceStationIdOrDestStationId(String sourceStationId, String destStationId);
}

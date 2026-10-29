package com.example.demo.repository;

import com.example.demo.entity.MetroCardPass;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MetroCardPassRepository extends JpaRepository<MetroCardPass, String> {
    List<MetroCardPass> findByCardIdOrderByCreatedAtDesc(String cardId);

    @Query("select p from MetroCardPass p where p.cardId = :cardId and p.startsAt <= :now and p.expiresAt > :now order by p.expiresAt desc")
    List<MetroCardPass> findActiveByCardId(@Param("cardId") String cardId, @Param("now") LocalDateTime now);

    @Query("select p from MetroCardPass p where p.cardId = :cardId and p.expiresAt > :now order by p.expiresAt desc")
    Optional<MetroCardPass> findCurrentOrUpcomingByCardId(@Param("cardId") String cardId, @Param("now") LocalDateTime now);
}

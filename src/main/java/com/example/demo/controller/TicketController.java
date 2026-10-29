package com.example.demo.controller;

import static com.example.demo.exception.Errors.notFound;
import static com.example.demo.exception.Errors.requireFound;
import static com.example.demo.exception.Errors.requireId;
import static com.example.demo.exception.Errors.requireNewId;

import com.example.demo.entity.MetroCardTransaction;
import com.example.demo.entity.Payment;
import com.example.demo.entity.Ticket;
import com.example.demo.repository.MetroCardRepository;
import com.example.demo.repository.MetroCardTransactionRepository;
import com.example.demo.repository.PaymentRepository;
import com.example.demo.repository.TicketRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tickets")
@Tag(name = "Tickets", description = "Issued tickets (new tickets are normally created through /api/bookings)")
public class TicketController {

    private final TicketRepository tickets;
    private final PaymentRepository payments;
    private final MetroCardRepository metroCards;
    private final MetroCardTransactionRepository transactions;

    public TicketController(TicketRepository tickets, PaymentRepository payments, MetroCardRepository metroCards,
                            MetroCardTransactionRepository transactions) {
        this.tickets = tickets;
        this.payments = payments;
        this.metroCards = metroCards;
        this.transactions = transactions;
    }

    @GetMapping
    @Operation(summary = "List all tickets")
    public List<Ticket> getAll() {
        return tickets.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a ticket record")
    public Ticket create(@RequestBody Ticket ticket) {
        requireId(ticket.ticketId, "Ticket");
        requireNewId(tickets.existsById(ticket.ticketId), "Ticket");
        return tickets.save(ticket);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Replace a ticket", description = "404 if the ticket does not exist.")
    public Ticket update(@PathVariable String id, @RequestBody Ticket ticket) {
        requireFound(tickets.existsById(id), "Ticket", id);
        ticket.ticketId = id;
        return tickets.save(ticket);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    @Operation(summary = "Delete or cancel a ticket",
            description = "404 if missing. Also deletes the ticket's payment record. If the ticket was paid with a "
                    + "metro card and has not been used, the amount is refunded to that card.")
    public void delete(@PathVariable String id) {
        Ticket ticket = tickets.findById(id).orElseThrow(() -> notFound("Ticket not found: " + id));
        List<Payment> ticketPayments = payments.findByTicketId(id);
        if (!ticket.isUsed) {
            for (Payment payment : ticketPayments) {
                if ("METRO_CARD".equals(payment.paymentMethod) && payment.metroCardId != null && payment.amount != null) {
                    metroCards.findByIdForUpdate(payment.metroCardId).ifPresent(card -> {
                        BigDecimal current = card.balance == null ? BigDecimal.ZERO : card.balance;
                        card.balance = current.add(payment.amount);
                        metroCards.save(card);
                        MetroCardTransaction tx = new MetroCardTransaction();
                        tx.transactionId = "MT-" + UUID.randomUUID().toString().substring(0, 12).toUpperCase();
                        tx.cardId = card.cardId;
                        tx.transactionType = "REFUND";
                        tx.description = "Refund for ticket " + id;
                        tx.amount = payment.amount;
                        tx.balanceAfter = card.balance;
                        tx.createdAt = LocalDateTime.now();
                        transactions.save(tx);
                    });
                }
            }
        }
        payments.deleteAll(ticketPayments);
        tickets.deleteById(id);
    }
}

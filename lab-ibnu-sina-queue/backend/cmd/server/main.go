package main

import (
	"encoding/json"
	"fmt"
	"os"

	"log"
	"net/http"
	"time"

	"lab-ibnu-sina-queue/internal/database"
	"lab-ibnu-sina-queue/internal/handlers"
	"lab-ibnu-sina-queue/internal/queue"

	"github.com/gorilla/mux"
)

var hub *handlers.Hub

func main() {
	// Initialize WebSocket Hub
	hub = handlers.NewHub()
	go hub.Run()

	// Initialize Database
	database.InitDB()

	r := mux.NewRouter()

	// =====================
	// KIOSK API Endpoints
	// =====================
	r.HandleFunc("/api/queue/create", CreateTicketHandler).Methods("POST")
	r.HandleFunc("/api/queue/recent", GetRecentTicketsHandler).Methods("GET")

	// =====================
	// ADMIN API Endpoints
	// =====================
	r.HandleFunc("/api/queue/waiting", GetWaitingHandler).Methods("GET")
	r.HandleFunc("/api/queue/stats", GetStatsHandler).Methods("GET")
	r.HandleFunc("/api/queue/call", CallTicketHandler).Methods("POST")
	r.HandleFunc("/api/queue/call-manual", CallManualHandler).Methods("POST")
	r.HandleFunc("/api/queue/recall", RecallTicketHandler).Methods("POST")
	r.HandleFunc("/api/queue/skip", SkipTicketHandler).Methods("POST")
	r.HandleFunc("/api/queue/finish", FinishTicketHandler).Methods("POST")
	r.HandleFunc("/api/queue/reset", ResetQueueHandler).Methods("POST")

	// Display Settings
	r.HandleFunc("/api/display/video", UpdateVideoHandler).Methods("POST")
	r.HandleFunc("/api/display/video", GetVideoHandler).Methods("GET")

	// WebSocket Endpoint
	r.HandleFunc("/ws", func(w http.ResponseWriter, req *http.Request) {
		handlers.ServeWs(hub, w, req)
	})

	// =====================
	// Serve Static Files
	// =====================
	staticDir := os.Getenv("STATIC_FILES_PATH")
	if staticDir == "" {
		staticDir = "../frontend"
	}

	r.PathPrefix("/kiosk/").Handler(http.StripPrefix("/kiosk/", http.FileServer(http.Dir(staticDir+"/kiosk"))))
	r.PathPrefix("/display/").Handler(http.StripPrefix("/display/", http.FileServer(http.Dir(staticDir+"/display"))))
	r.PathPrefix("/admin/").Handler(http.StripPrefix("/admin/", http.FileServer(http.Dir(staticDir+"/admin"))))
	r.PathPrefix("/shared/").Handler(http.StripPrefix("/shared/", http.FileServer(http.Dir(staticDir+"/shared"))))

	// Default redirect to kiosk
	r.HandleFunc("/", func(w http.ResponseWriter, req *http.Request) {
		http.Redirect(w, req, "/kiosk/", http.StatusFound)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Handler:      r,
		Addr:         "0.0.0.0:" + port,
		WriteTimeout: 15 * time.Second,
		ReadTimeout:  15 * time.Second,
	}

	fmt.Printf("Server running on http://0.0.0.0:%s\n", port)
	log.Fatal(srv.ListenAndServe())
}

// =====================
// REQUEST TYPES
// =====================

type CreateTicketRequest struct {
	CategoryID int `json:"category_id"`
}

type CallTicketRequest struct {
	TicketID int `json:"ticket_id"`
	Counter  int `json:"counter"`
}

type TicketIDRequest struct {
	TicketID int `json:"ticket_id"`
}

// Store last called ticket per counter for recall
var lastCalledTickets = make(map[int]queue.Ticket)

// =====================
// KIOSK HANDLERS
// =====================

func CreateTicketHandler(w http.ResponseWriter, r *http.Request) {
	var req CreateTicketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	ticket, err := queue.GenerateTicket(req.CategoryID)
	if err != nil {
		log.Printf("Error creating ticket: %v", err)
		http.Error(w, "Database Error", http.StatusInternalServerError)
		return
	}

	fmt.Printf("[PRINTER] Printing ticket: %s\n", ticket.FormattedCode)

	msg, _ := json.Marshal(map[string]interface{}{
		"type": "NEW_TICKET",
		"data": ticket,
	})
	hub.BroadcastMessage(msg)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ticket)
}

func GetRecentTicketsHandler(w http.ResponseWriter, r *http.Request) {
	tickets, err := queue.GetRecentTickets()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tickets)
}

// =====================
// ADMIN HANDLERS
// =====================

func GetWaitingHandler(w http.ResponseWriter, r *http.Request) {
	tickets, err := queue.GetWaitingTickets()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tickets)
}

func GetStatsHandler(w http.ResponseWriter, r *http.Request) {
	stats, err := queue.GetQueueStats()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func CallManualHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code    string `json:"code"`
		Counter int    `json:"counter"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Find ticket by code
	t, err := queue.GetTicketByCode(req.Code)
	if err != nil {
		http.Error(w, "Ticket not found", http.StatusNotFound)
		return
	}

	// Call it
	ticket, err := queue.CallTicket(t.ID, req.Counter)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Store for recall
	lastCalledTickets[req.Counter] = ticket

	fmt.Printf("[MANUAL CALL] Calling ticket %s to Counter %d\n", ticket.FormattedCode, req.Counter)

	// Broadcast to display
	msg, _ := json.Marshal(map[string]interface{}{
		"type": "CALL_TICKET",
		"data": ticket,
	})
	hub.BroadcastMessage(msg)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ticket)
}

func CallTicketHandler(w http.ResponseWriter, r *http.Request) {
	var req CallTicketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	ticket, err := queue.CallTicket(req.TicketID, req.Counter)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Store for recall
	lastCalledTickets[req.Counter] = ticket

	fmt.Printf("[CALL] Calling ticket %s to Counter %d\n", ticket.FormattedCode, req.Counter)

	// Broadcast to display
	msg, _ := json.Marshal(map[string]interface{}{
		"type": "CALL_TICKET",
		"data": ticket,
	})
	hub.BroadcastMessage(msg)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ticket)
}

func RecallTicketHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Counter int `json:"counter"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	ticket, exists := lastCalledTickets[req.Counter]
	if !exists {
		http.Error(w, "No ticket to recall", http.StatusNotFound)
		return
	}

	fmt.Printf("[RECALL] Recalling ticket %s to Counter %d\n", ticket.FormattedCode, req.Counter)

	// Broadcast recall
	msg, _ := json.Marshal(map[string]interface{}{
		"type": "CALL_TICKET",
		"data": ticket,
	})
	hub.BroadcastMessage(msg)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ticket)
}

func SkipTicketHandler(w http.ResponseWriter, r *http.Request) {
	var req TicketIDRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	err := queue.SkipTicket(req.TicketID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "skipped"})
}

func FinishTicketHandler(w http.ResponseWriter, r *http.Request) {
	var req TicketIDRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	err := queue.FinishTicket(req.TicketID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "finished"})
}

func ResetQueueHandler(w http.ResponseWriter, r *http.Request) {
	err := queue.ResetDailyQueue()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Broadcast reset
	msg, _ := json.Marshal(map[string]interface{}{
		"type": "RESET_QUEUE",
	})
	hub.BroadcastMessage(msg)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "reset"})
}

func UpdateVideoHandler(w http.ResponseWriter, r *http.Request) {
	var req queue.DisplaySettings
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Update DB
	if err := queue.UpdateDisplaySettings(req); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Broadcast to display
	msg, _ := json.Marshal(map[string]interface{}{
		"type": "UPDATE_VIDEO",
		"data": req,
	})
	hub.BroadcastMessage(msg)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
}

func GetVideoHandler(w http.ResponseWriter, r *http.Request) {
	settings, err := queue.GetDisplaySettings()
	if err != nil {
		// Log error but generally return something to avoid blocking frontend
		log.Printf("Error getting settings: %v", err)
		http.Error(w, "Database Error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(settings)
}

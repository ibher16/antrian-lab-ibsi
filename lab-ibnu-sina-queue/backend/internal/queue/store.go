package queue

import (
	"fmt"
	"lab-ibnu-sina-queue/internal/database"
	"time"
)

type Ticket struct {
	ID            int       `json:"id"`
	CategoryID    int       `json:"category_id"`
	FormattedCode string    `json:"formatted_code"`
	Status        string    `json:"status"`
	Counter       int       `json:"counter"`
	CreatedAt     time.Time `json:"created_at"`
}

type DisplaySettings struct {
	VideoURL string `json:"video_url"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle"`
}

// GenerateTicket creates a new ticket in the DB
func GenerateTicket(categoryID int) (Ticket, error) {
	// 1. Get current max number for today for this category
	var lastNum int
	err := database.DB.QueryRow(`
		SELECT COALESCE(MAX(ticket_number), 0) 
		FROM queues 
		WHERE category_id = ? AND DATE(created_at) = CURDATE()
	`, categoryID).Scan(&lastNum)

	if err != nil {
		return Ticket{}, err
	}

	newNum := lastNum + 1

	// Get Prefix
	var prefix string
	err = database.DB.QueryRow("SELECT prefix FROM categories WHERE id = ?", categoryID).Scan(&prefix)
	if err != nil {
		return Ticket{}, err
	}

	formatted := fmt.Sprintf("%s-%03d", prefix, newNum)

	// Insert
	res, err := database.DB.Exec(`
		INSERT INTO queues (category_id, ticket_number, formatted_code, status) 
		VALUES (?, ?, ?, 'waiting')
	`, categoryID, newNum, formatted)

	if err != nil {
		return Ticket{}, err
	}

	id, _ := res.LastInsertId()

	return Ticket{
		ID:            int(id),
		CategoryID:    categoryID,
		FormattedCode: formatted,
		Status:        "waiting",
		CreatedAt:     time.Now(),
	}, nil
}

// UpdateStatus changes ticket status (e.g. calling, finished)
func UpdateStatus(ticketID int, status string, counter int) error {
	_, err := database.DB.Exec(`
		UPDATE queues SET status = ?, counter_number = ? WHERE id = ?
	`, status, counter, ticketID)
	return err
}

// GetNextWaiting gets the next ticket to call for a category
func GetNextWaiting(categoryID int) (Ticket, error) {
	var t Ticket
	err := database.DB.QueryRow(`
		SELECT id, category_id, formatted_code, status, counter_number, created_at 
		FROM queues 
		WHERE category_id = ? AND status = 'waiting'
		ORDER BY id ASC LIMIT 1
	`, categoryID).Scan(&t.ID, &t.CategoryID, &t.FormattedCode, &t.Status, &t.Counter, &t.CreatedAt)

	return t, err
}

// GetRecentTickets returns the last 5 active/waiting tickets
func GetRecentTickets() ([]Ticket, error) {
	rows, err := database.DB.Query(`
		SELECT id, category_id, formatted_code, status, counter_number, created_at
		FROM queues
		ORDER BY id DESC LIMIT 5
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tickets []Ticket
	for rows.Next() {
		var t Ticket
		if err := rows.Scan(&t.ID, &t.CategoryID, &t.FormattedCode, &t.Status, &t.Counter, &t.CreatedAt); err != nil {
			continue
		}
		tickets = append(tickets, t)
	}
	return tickets, nil
}

// GetWaitingTickets returns all waiting tickets grouped by category
func GetWaitingTickets() ([]Ticket, error) {
	rows, err := database.DB.Query(`
		SELECT id, category_id, formatted_code, status, counter_number, created_at
		FROM queues
		WHERE status = 'waiting' AND DATE(created_at) = CURDATE()
		ORDER BY category_id, id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tickets []Ticket
	for rows.Next() {
		var t Ticket
		if err := rows.Scan(&t.ID, &t.CategoryID, &t.FormattedCode, &t.Status, &t.Counter, &t.CreatedAt); err != nil {
			continue
		}
		tickets = append(tickets, t)
	}
	return tickets, nil
}

// CallTicket marks a ticket as 'calling' and assigns counter
func CallTicket(ticketID int, counter int) (Ticket, error) {
	_, err := database.DB.Exec(`
		UPDATE queues SET status = 'calling', counter_number = ? WHERE id = ?
	`, counter, ticketID)
	if err != nil {
		return Ticket{}, err
	}

	var t Ticket
	err = database.DB.QueryRow(`
		SELECT id, category_id, formatted_code, status, counter_number, created_at
		FROM queues WHERE id = ?
	`, ticketID).Scan(&t.ID, &t.CategoryID, &t.FormattedCode, &t.Status, &t.Counter, &t.CreatedAt)

	return t, err
}

// FinishTicket marks ticket as finished
func FinishTicket(ticketID int) error {
	_, err := database.DB.Exec(`UPDATE queues SET status = 'finished' WHERE id = ?`, ticketID)
	return err
}

// SkipTicket marks ticket as skipped
func SkipTicket(ticketID int) error {
	_, err := database.DB.Exec(`UPDATE queues SET status = 'skipped' WHERE id = ?`, ticketID)
	return err
}

// ResetDailyQueue resets all today's queues
func ResetDailyQueue() error {
	_, err := database.DB.Exec(`DELETE FROM queues WHERE DATE(created_at) = CURDATE()`)
	return err
}

// GetQueueStats returns today's queue statistics
func GetQueueStats() (map[string]int, error) {
	stats := make(map[string]int)
	var count int

	// Total waiting
	database.DB.QueryRow(`SELECT COUNT(*) FROM queues WHERE status = 'waiting' AND DATE(created_at) = CURDATE()`).Scan(&count)
	stats["waiting"] = count

	// Total calling
	database.DB.QueryRow(`SELECT COUNT(*) FROM queues WHERE status = 'calling' AND DATE(created_at) = CURDATE()`).Scan(&count)
	stats["calling"] = count

	// Total finished
	database.DB.QueryRow(`SELECT COUNT(*) FROM queues WHERE status = 'finished' AND DATE(created_at) = CURDATE()`).Scan(&count)
	stats["finished"] = count

	// Total skipped
	database.DB.QueryRow(`SELECT COUNT(*) FROM queues WHERE status = 'skipped' AND DATE(created_at) = CURDATE()`).Scan(&count)
	stats["skipped"] = count

	// Total today
	database.DB.QueryRow(`SELECT COUNT(*) FROM queues WHERE DATE(created_at) = CURDATE()`).Scan(&count)
	stats["total"] = count

	return stats, nil
}

// GetCurrentCalling returns the currently calling ticket for a counter
func GetCurrentCalling(counter int) (Ticket, error) {
	var t Ticket
	err := database.DB.QueryRow(`
		SELECT id, category_id, formatted_code, status, counter_number, created_at
		FROM queues 
		WHERE status = 'calling' AND counter_number = ?
		ORDER BY updated_at DESC LIMIT 1
	`, counter).Scan(&t.ID, &t.CategoryID, &t.FormattedCode, &t.Status, &t.Counter, &t.CreatedAt)
	return t, err
}

// GetTicketByCode finds a ticket by its code (e.g. "A-005") for today
func GetTicketByCode(code string) (Ticket, error) {
	var t Ticket
	err := database.DB.QueryRow(`
		SELECT id, category_id, formatted_code, status, counter_number, created_at
		FROM queues
		WHERE formatted_code = ? AND DATE(created_at) = CURDATE()
	`, code).Scan(&t.ID, &t.CategoryID, &t.FormattedCode, &t.Status, &t.Counter, &t.CreatedAt)
	return t, err
}

// GetDisplaySettings retrieves the current video/text settings
func GetDisplaySettings() (DisplaySettings, error) {
	var s DisplaySettings
	err := database.DB.QueryRow(`
		SELECT video_url, title, subtitle FROM display_settings WHERE id = 1
	`).Scan(&s.VideoURL, &s.Title, &s.Subtitle)
	return s, err
}

// UpdateDisplaySettings updates the video/text settings
func UpdateDisplaySettings(s DisplaySettings) error {
	_, err := database.DB.Exec(`
		UPDATE display_settings SET video_url = ?, title = ?, subtitle = ? WHERE id = 1
	`, s.VideoURL, s.Title, s.Subtitle)
	return err
}

# CHANGELOG

> Newest first. Format: ## YYYY-MM-DD #NNN type: description

<!-- Entries below -->

## 2026-03-02 #003 fix: UI improvements for expense categories

**UI Fixes:**
- **FIXED**: Removed pre-selected laundry button for expense transactions - all buttons now start grey/unselected until user clicks
- **REMOVED**: 'Vendomat rent' cost category from fixed costs (vendomat has been returned)
- **IMPROVED**: Cleaner expense assignment flow requiring explicit user selection

## 2026-03-02 #002 feat: Add expense cost categories to bank reconciliation

**New Feature: Expense Cost Categories**
- **NEW**: Cost category system for expense transactions during bank reconciliation
- **NEW**: `constants/costCategories.ts` - configurable variable vs fixed cost categories
- **UI ENHANCEMENT**: Category dropdown selection required for expense assignment
- **BACKEND**: Category field support in expenditure routes and database functions
- **FRONTEND**: Category display in assigned transaction lists

**Key Improvements:**
- **Structured expense categorization**: Variable costs (detergents, water, gas, electricity, vendomat materials) for laundry agents (brandoa1/brandoa2)
- **Fixed cost tracking**: Rent, accounting, maintenance, insurance, telecom, admin, advertising, taxes for General agent
- **Required category selection**: Expense transactions now require category selection before assignment
- **Visual feedback**: Assigned transactions show category labels (e.g., 'brandoa1 → Detergents')
- **Removed bulk assignment**: "Process All" button removed for expenses due to category requirement

**Implementation Details:**
- Category parameter added to backend assignment endpoints with audit trail
- Frontend category dropdown with agent-specific filtering
- Reconciliation hooks and API service updated to support categories
- Database schema already supported categories (no migration needed)
- Comprehensive test coverage for new functionality

**Migration Notes:**
- Existing assigned transactions continue to work (category field nullable)
- New expense assignments require category selection in UI
- Stripe credit assignments unchanged (no category required)

## 2026-03-01 #001 refactor: Implement reliable machine event collection system

**Architecture Changes:**
- **NEW**: `MachineEventCollector` - 24/7 reliable event collection service
- **REFACTORED**: `SpeedQueenService` - now focused on REST API and command tracking only
- **DATABASE**: Added `isTransition` column to `machine_events` table for event type distinction
- **DATABASE**: Added `getLastKnownStatus()` function for persistent baseline recovery

**Key Improvements:**
- **Persistent baseline**: Machine status baseline loaded from database, survives server restarts
- **No missed events**: WebSocket reconnects no longer reset event tracking state
- **Dual event types**: Transitions (isTransition=1) and periodic snapshots (isTransition=0)
- **Separated concerns**: Event collection independent from UI cache management
- **Automatic snapshots**: Every 5 minutes to ensure data completeness even during WebSocket outages

**Implementation Details:**
- `MachineEventCollector` manages WebSocket lifecycle with exponential backoff reconnection
- `SpeedQueenService` constructor now takes `MachineEventCollector` instance instead of API config
- All event logging functionality moved from `SpeedQueenService` to `MachineEventCollector`
- Updated server initialization to create and start `MachineEventCollector` first
- Comprehensive test coverage for new architecture

**Migration Notes:**
- Database migration adds `isTransition` column with try/catch pattern (backward compatible)
- Existing `machine_events` data remains fully compatible
- All existing REST API functionality preserved in `SpeedQueenService`
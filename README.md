# Digishare API Bridge

A minimal API bridge service built with Elysia.js that receives Digishare webhook events and forwards them to external client APIs.

## Features

- **Webhook Endpoints**: Handles `ticket.created` and `ticket.updated` events
- **Data Transformation**: Converts Digishare event format to external API parameters
- **Authentication**: API key validation for incoming webhooks
- **Error Handling**: Comprehensive logging and error management
- **TypeScript**: Full type safety with TypeScript

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the `.env` file and update the values:

```bash
# API Bridge Configuration
API_KEY=your_digishare_api_key_here
TARGET_BASE_URL=http://192.168.50.70/CRM_PROD
TARGET_API_KEY=your_external_api_key_here

# Server Configuration
PORT=3000
```

### 3. Run the Service

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

## API Endpoints

### Health Check
```
GET /
```
Returns service status and timestamp.

### Ticket Created Webhook
```
POST /webhook/ticket-created
Authorization: Bearer {API_KEY}
Content-Type: application/json
```

Receives Digishare `ticket.created` events and forwards to:
- `{TARGET_BASE_URL}/Api/Leads/CreateNewLead`

### Ticket Updated Webhook
```
POST /webhook/ticket-updated
Authorization: Bearer {API_KEY}
Content-Type: application/json
```

Receives Digishare `ticket.updated` events and forwards to:
- `{TARGET_BASE_URL}/Api/Leads/UpdateLeadAndBesoins`
- `{TARGET_BASE_URL}/Api/Leads/UpdateConversationBesoin`

## Data Transformation

The service automatically transforms Digishare webhook data to the external API format:

### Digishare → External API Mapping

| Digishare Field | External API Parameter |
|----------------|------------------------|
| `data.information.third.name` | `Name` |
| `data.information.third.mobile` | `Phone` |
| `data.information.id_projet` | `IdProjet` |
| `data.information.id_lead` | `IdLead` |
| `data.information.third.email` | `Email` |
| `data.channel_id` | `Source` (mapped) |
| `data.comment` | `Comment` |
| `data.information.utm_*` | `Utm_*` |
| `data.information.ville` | `Ville` |
| `data.information.nature` | `Nature` |
| `data.demand_date` | `DateLead` |

## Example Usage

### Testing with curl

```bash
# Test ticket created
curl -X POST http://localhost:3000/webhook/ticket-created \
  -H "Authorization: Bearer your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "ticket.created",
    "data": {
      "id": "test123",
      "data": {
        "id": "test123",
        "subject": "Test Ticket",
        "comment": "Test comment",
        "channel_id": "web",
        "information": {
          "third": {
            "name": "John Doe",
            "email": "john@example.com",
            "mobile": "+1234567890"
          },
          "id_projet": "proj123",
          "id_lead": "lead123"
        }
      },
      "wasRecentlyCreated": true
    }
  }'
```

## Logging

The service provides detailed logging for:
- Incoming webhook requests
- Data transformation
- External API calls
- Errors and warnings

Logs are output to console with timestamps and structured data.

## Error Handling

- **Authentication**: Returns 401 for invalid API keys
- **Validation**: Returns 400 for invalid event types or malformed data
- **External API**: Logs and returns details of external API failures
- **Network**: Handles timeouts and connection errors

## Development

### Project Structure

```
src/
├── index.ts        # Main Elysia server
├── types.ts        # TypeScript type definitions
└── transformer.ts  # Data transformation utilities
```

### Building

```bash
npm run build
```

### Type
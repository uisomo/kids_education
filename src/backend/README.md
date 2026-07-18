# Backend Directory

## ⚙️ **Purpose**
Node.js backend services for CSV data management, character progression logic, and API endpoints.

## 📁 **Directory Structure**

### `/api/`
**Purpose**: REST API endpoints for client-server communication
- `character-routes.ts` - Character data CRUD operations
- `stats-routes.ts` - Stat modification and validation endpoints
- `items-routes.ts` - Item management and unlock checking
- `progression-routes.ts` - Experience and level advancement logic
- `health-routes.ts` - System health monitoring and diagnostics

### `/services/`
**Purpose**: Core business logic and data processing services
- `csv-data-manager.ts` - Centralized CSV file operations with thread safety
- `character-progression.ts` - Stat advancement and experience calculation
- `item-manager.ts` - Item unlock logic and inventory management
- `validation-service.ts` - Data integrity and structure validation
- `notification-service.ts` - User feedback and achievement processing

### `/websocket/`
**Purpose**: Real-time communication for live updates
- `dashboard-socket.ts` - Real-time dashboard state synchronization
- `progression-events.ts` - Live stat updates and level-up notifications
- `system-events.ts` - Health monitoring and error broadcasting

### `/utils/`
**Purpose**: Backend-specific utility functions
- `file-operations.ts` - Safe file reading/writing with error handling
- `data-transformation.ts` - CSV parsing and data format conversion
- `performance-monitor.ts` - Operation timing and resource tracking
- `error-handler.ts` - Centralized error processing and logging

## 🎯 **Key Features**

### 📊 **CSV Data Management**
- Thread-safe concurrent access with file locking mechanisms
- Automatic backup creation for destructive operations
- Data validation with custom schema support
- Error recovery with rollback capabilities
- Performance monitoring and optimization tracking

### 🎮 **Character Progression Engine**
- Intelligent stat advancement algorithms
- Experience curve balancing for engaging progression
- Item unlock prediction based on current stats
- Achievement tracking and milestone recognition
- Undo functionality for accidental changes

### 🔒 **Data Integrity**
- Comprehensive input validation for all operations
- Automatic data sanitization for child safety
- Concurrent access protection with proper locking
- Backup and recovery mechanisms for data protection

### 📡 **Real-time Updates**
- WebSocket connections for live dashboard synchronization
- Event-driven architecture for immediate user feedback
- Efficient change detection and delta updates
- Connection management with automatic reconnection

## 🔧 **Development Guidelines**

### Service Module Structure
```typescript
/**
 * Ultimate Role:
 * - To produce [specific output] based on input [input types]
 * - Key feature is [unique functionality]
 *
 * Components:
 * - ComponentA: [purpose and key feature]
 * - ComponentB: [purpose and key feature]
 *
 * Workflow:
 * - First, [step 1 description]
 * - Second, [step 2 description]
 *
 * Workflow Visualized:
 * - Input A,B => ComponentA => Output C,D
 * - Input C,D => ComponentB => Final Output
 *
 * Log: User wants followings.
 * - Add [feature]. Module [name] has changed.
 */

import { logger } from '../utils/universal-logger';

class ServiceName {
  constructor() {
    logger.info('Service initialized', { service: 'ServiceName' });
  }

  async processData(input: InputType): Promise<OutputType> {
    try {
      logger.debug('Processing started', { input });
      const result = await this.performOperation(input);
      logger.info('Processing completed', { result });
      return result;
    } catch (error) {
      logger.error('Processing failed', { error, input });
      throw error;
    }
  }
}
```

### API Endpoint Pattern
```typescript
import express from 'express';
import { logger } from '../utils/universal-logger';

const router = express.Router();

router.post('/character/stats/update', async (req, res) => {
  try {
    const { characterId, statName, increment } = req.body;

    // Validation
    if (!characterId || !statName || typeof increment !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request parameters'
      });
    }

    // Business logic
    const result = await characterService.updateStat(characterId, statName, increment);

    logger.info('Stat update successful', { characterId, statName, increment });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Stat update failed', { error, body: req.body });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});
```

### CSV Operations Safety
```typescript
import fs from 'fs/promises';
import { logger } from '../utils/universal-logger';

class CSVDataManager {
  private locks = new Map<string, Promise<any>>();

  async safeOperation<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
    // Ensure only one operation per file at a time
    if (this.locks.has(filePath)) {
      await this.locks.get(filePath);
    }

    const operationPromise = this.executeWithBackup(filePath, operation);
    this.locks.set(filePath, operationPromise);

    try {
      const result = await operationPromise;
      this.locks.delete(filePath);
      return result;
    } catch (error) {
      this.locks.delete(filePath);
      throw error;
    }
  }

  private async executeWithBackup<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
    // Create backup before destructive operations
    const backupPath = `${filePath}.backup.${Date.now()}`;
    await fs.copyFile(filePath, backupPath);

    try {
      const result = await operation();
      // Remove backup on success
      await fs.unlink(backupPath);
      return result;
    } catch (error) {
      // Restore from backup on failure
      await fs.copyFile(backupPath, filePath);
      await fs.unlink(backupPath);
      throw error;
    }
  }
}
```

## 📊 **Performance Targets**
- **CSV Operations**: < 10ms per record for read/write operations
- **API Response Time**: < 100ms for 95th percentile requests
- **Memory Usage**: < 100MB total backend memory footprint
- **Concurrent Users**: Support 50+ simultaneous connections
- **File Locking**: < 1ms overhead for concurrency protection

## 🔒 **Security Measures**
- Input validation for all API endpoints
- SQL injection prevention for data queries
- File path traversal protection
- Rate limiting for API endpoints
- Child-safe data sanitization

## 🧪 **Testing Strategy**
- Unit tests for all service modules
- Integration tests for API endpoints
- Load tests for concurrent CSV operations
- Error recovery tests for file operations
- Performance benchmarks for optimization

## 📦 **Dependencies**
- Node.js 18+ for runtime environment
- Express.js for API framework
- TypeScript for type safety
- Socket.io for WebSocket communication
- Jest for testing framework
- CSV parsing libraries for data handling

## 🚀 **Deployment Considerations**
- Environment-specific configuration management
- Process monitoring and automatic restart
- Log aggregation and monitoring
- Health check endpoints for load balancers
- Graceful shutdown handling for WebSocket connections
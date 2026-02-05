# Claude.md - Production-Ready Codebase from Business case

Rules and best practices for transforming a Business case into a production-ready codebase.

---

## Phase 1: Understanding the Business case

### 1.1 Read the Requirements Thoroughly

Before writing any code:
1. **Read the entire Business case document** multiple times
2. **Identify explicit requirements** (what MUST be done)
3. **Identify implicit requirements** (what is expected but not stated)
4. **Note any ambiguities** - make assumptions and document them

### 1.2 Ask Clarifying Questions

Questions to consider:
- What is the expected input/output format?
- What are the edge cases?
- What happens when things fail?
- Are there performance constraints?
- Is there a preferred technology stack?
- What constitutes "done"?

### 1.3 Document Assumptions

Create a section in README.md documenting:
```markdown
## Design Decisions & Assumptions
1. **Assumption**: [What you assumed]
   **Rationale**: [Why you made this choice]
```

---

## Phase 2: Planning Before Coding

### 2.1 Create a Planning Document

Before writing code, create `docs/Planning.md` with:
- **Overview**: Problem summary
- **Architecture diagram**: Visual representation of the system
- **Data flow**: How data moves through the system
- **State schema**: All data structures
- **Implementation checklist**: MVP vs. stretch goals

### 2.2 Define the MVP First

Separate requirements into:
- **MVP (Must Have)**: Core requirements that must work
- **Beyond MVP (Nice to Have)**: Extras that demonstrate excellence

### 2.3 Design the Architecture

```
project/
├── src/
│   ├── __init__.py
│   ├── [domain]/          # Domain-specific code
│   ├── infrastructure/    # Cross-cutting concerns
│   ├── data/              # Data layer
│   └── [entry_point].py   # Main orchestration
├── tests/
│   ├── conftest.py        # Shared fixtures
│   ├── test_*.py          # Test files
│   └── README.md          # Test documentation
├── docs/
│   ├── Planning.md        # Design documentation
│   └── [other docs]
├── requirements.txt
├── README.md
└── setup.sh               # One-command setup
```

---

## Phase 3: Test-Driven Development (TDD)

### 3.1 Write Tests First

1. **Start with behavioral tests** - What should the system DO?
2. **Write failing tests** before implementation
3. **One test per requirement** from the Business case

### 3.2 Test Structure

```python
"""
Behavioral Tests for [Feature].

These tests validate:
1. [Requirement 1]
2. [Requirement 2]
"""

class TestBehavior:
    def test_[requirement]_[scenario](self, fixtures):
        """
        Test [what it tests].

        Flow:
        1. [Step 1]
        2. [Step 2]
        """
        # Arrange
        state = make_state("input")

        # Act
        result = system.process(state)

        # Assert
        assert result["field"] == expected_value
```

### 3.3 Use Fixtures for Reusability

```python
# conftest.py
@pytest.fixture
def base_state():
    """Minimal valid state template"""
    return {"field": "default"}

@pytest.fixture
def make_state(base_state):
    """Factory fixture to create customized state"""
    def _make(input_value, **overrides):
        state = base_state.copy()
        state["input"] = input_value
        state.update(overrides)
        return state
    return _make
```

### 3.4 Test Categories

1. **Happy path**: Normal flow works
2. **Edge cases**: Boundary conditions
3. **Error handling**: Graceful degradation
4. **Integration**: Components work together

---

## Phase 4: Production Best Practices

### 4.1 Type Safety

```python
from typing import Dict, Any, Literal, Optional
from typing import TypedDict

class State(TypedDict):
    """Typed state schema with documentation"""
    field: str
    optional_field: Optional[str]
    status: Literal["pending", "done"]
```

### 4.2 Constants (No Magic Numbers)

```python
# constants.py
CONFIDENCE_THRESHOLD = 6      # Route to validator if below
MAX_ATTEMPTS = 3              # Circuit breaker limit
DEFAULT_TIMEOUT = 30          # API timeout in seconds
```

### 4.3 Base Classes with Error Handling

```python
class BaseAgent(ABC):
    """Base interface with built-in error handling and metrics"""

    def invoke(self, state: State) -> Dict[str, Any]:
        start_time = datetime.now()
        try:
            result = self._process(state)
            self._record_success(start_time)
            return result
        except Exception as e:
            self._record_failure(start_time)
            return self._handle_error(state, e)

    @abstractmethod
    def _process(self, state: State) -> Dict[str, Any]:
        """Implement actual logic here"""
        pass

    def _handle_error(self, state: State, error: Exception) -> Dict[str, Any]:
        """Return error state instead of raising"""
        return {"error": str(error), "confidence": 0}
```

### 4.4 Logging with Context

```python
import logging

logger = logging.getLogger(__name__)

def process(state):
    conversation_id = state.get("conversation_id", "unknown")
    logger.info(f"Processing started - conversation_id: {conversation_id}")
    # ... processing ...
    logger.info(f"Processing completed - conversation_id: {conversation_id}, duration: {duration}s")
```

### 4.5 Timeout Protection

```python
from functools import wraps
import threading

def timeout(seconds):
    """Cross-platform timeout decorator"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            result = [None]
            exception = [None]

            def target():
                try:
                    result[0] = func(*args, **kwargs)
                except Exception as e:
                    exception[0] = e

            thread = threading.Thread(target=target)
            thread.start()
            thread.join(timeout=seconds)

            if thread.is_alive():
                raise TimeoutError(f"Operation timed out after {seconds}s")
            if exception[0]:
                raise exception[0]
            return result[0]
        return wrapper
    return decorator
```

### 4.6 Circuit Breaker Pattern

```python
class CircuitBreaker:
    """Prevent cascading failures"""

    def __init__(self, failure_threshold=3, recovery_timeout=60):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failures = 0
        self.state = "CLOSED"
        self.last_failure_time = None

    def call(self, func, *args, **kwargs):
        if self.state == "OPEN":
            if self._should_attempt_recovery():
                self.state = "HALF_OPEN"
            else:
                raise CircuitOpenError("Circuit is OPEN")

        try:
            result = func(*args, **kwargs)
            self._record_success()
            return result
        except Exception as e:
            self._record_failure()
            raise
```

### 4.7 Thread-Safe Singletons

```python
import threading

class MetricsCollector:
    """Thread-safe singleton for metrics collection"""
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:  # Double-check locking
                    cls._instance = super().__new__(cls)
                    cls._instance._metrics = {}
                    cls._instance._metrics_lock = threading.Lock()
        return cls._instance

    def record(self, name: str, value: float):
        with self._metrics_lock:
            self._metrics[name] = value
```

### 4.8 Input Validation & Sanitization

```python
from constants import MIN_QUERY_LENGTH, MAX_QUERY_LENGTH

def validate_input(query: str) -> tuple[bool, str]:
    """Validate and sanitize user input"""
    if not query or not isinstance(query, str):
        return False, "Query must be a non-empty string"

    query = query.strip()

    if len(query) < MIN_QUERY_LENGTH:
        return False, f"Query must be at least {MIN_QUERY_LENGTH} characters"

    if len(query) > MAX_QUERY_LENGTH:
        return False, f"Query must not exceed {MAX_QUERY_LENGTH} characters"

    return True, query
```

### 4.9 Graceful Degradation

```python
def get_data(company: str) -> Dict[str, Any]:
    """Try primary source, fall back to secondary"""
    try:
        # Try real API first
        if api_key_configured():
            return real_api.search(company)
    except Exception as e:
        logger.warning(f"API failed, using fallback: {e}")

    # Fall back to mock data
    return mock_data.get(company, default_response())
```

---

## Phase 5: Documentation

### 5.1 README.md Structure

```markdown
# Project Name

One-line description of what it does.

## Setup

### Quick Start (Automated)
```bash
bash setup.sh
```

### Manual Setup
[Step-by-step instructions]

### Prerequisites
- Python 3.12+
- Required API keys (optional)

## Running the System

### Quick Example
```bash
bash run_example.sh
```

### Run Tests
```bash
bash run_tests.sh
```

## Architecture
[Diagram and explanation]

## Project Structure
[Tree view with descriptions]

## Key Features Implemented

### ✅ MVP Requirements
- [x] Feature 1
- [x] Feature 2

### Beyond Expected Deliverable
[List of extras with explanations]

## Design Decisions & Assumptions
[Documented assumptions]

## Testing
[How to run tests, what they cover]
```

### 5.2 Code Documentation

```python
def process_query(query: str, context: Dict[str, Any]) -> Result:
    """
    Process a user query and return results.

    Args:
        query: The user's question
        context: Conversation context including history

    Returns:
        Result object containing response and metadata

    Raises:
        ValidationError: If query is invalid
        TimeoutError: If processing exceeds timeout
    """
```

---

## Phase 6: DevOps & Deployment

### 6.1 One-Command Setup

```bash
#!/bin/bash
# setup.sh - One command to set up everything

set -e  # Exit on error

echo "Creating virtual environment..."
python3 -m venv venv

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing dependencies..."
pip install -r requirements.txt

echo "Verifying installation..."
python -c "import src; print('✅ Setup complete')"
```

### 6.2 Environment Configuration

```bash
# .env.example (committed to repo)
OPENAI_API_KEY="your-key-here"
TAVILY_API_KEY="your-key-here"

# .env (not committed - in .gitignore)
```

### 6.3 Docker Support

```dockerfile
# Multi-stage build for smaller image
FROM python:3.12-slim AS base
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM base AS production
COPY src/ src/
CMD ["python", "-m", "src.main"]

FROM base AS development
COPY . .
CMD ["pytest", "-v"]
```

### 6.4 Helper Scripts

```bash
# run_tests.sh
#!/bin/bash
source venv/bin/activate
pytest tests/ -v

# run_example.sh
#!/bin/bash
source venv/bin/activate
python example.py
```

---

## Phase 7: Quality Checklist

### Before Submission

- [ ] **All tests pass** (`pytest -v`)
- [ ] **No linting errors** (if applicable)
- [ ] **README is complete** and accurate
- [ ] **setup.sh works** from fresh clone
- [ ] **All requirements implemented** from Business case
- [ ] **Assumptions documented**
- [ ] **Code has type hints**
- [ ] **No hardcoded values** (use constants)
- [ ] **No commented-out code**
- [ ] **No unused imports/variables**
- [ ] **Error handling in place**
- [ ] **Logging for debugging**
- [ ] **.gitignore configured** (no venv, .env, __pycache__)
- [ ] **.env.example provided** (not actual secrets)

### Code Quality Standards

- [ ] Single responsibility principle
- [ ] DRY (Don't Repeat Yourself)
- [ ] Clear naming conventions
- [ ] Consistent formatting
- [ ] Appropriate abstraction level
- [ ] No over-engineering

---

## Phase 8: Going Beyond MVP

### Ways to Demonstrate Excellence

1. **Production Infrastructure**
   - Error handling with graceful degradation
   - Structured logging with context
   - Metrics collection
   - Circuit breaker pattern
   - Timeout protection
   - Thread safety

2. **UX Improvements**
   - CLI interface
   - Streaming responses
   - Clear error messages
   - Progress indicators

3. **API Integrations**
   - Real API integration (with fallback)
   - LLM-based enhancements
   - External service clients

4. **DevOps**
   - Docker containerization
   - docker-compose for services
   - CI/CD configuration
   - Multi-stage builds

5. **Advanced Testing**
   - Parametrized tests
   - Mock fixtures
   - Integration tests
   - Performance tests

### Document Everything Extra

In README.md:
```markdown
## Beyond Expected Deliverable

The following features have been implemented beyond MVP requirements:

### 1. Feature Name
- What it does
- Why it's useful
- How to use it
```

---

## Summary: The Production-Ready Mindset

1. **Understand** before coding
2. **Plan** the architecture
3. **Test first** (TDD)
4. **Handle errors** gracefully
5. **Log** for observability
6. **Document** thoroughly
7. **Automate** setup and testing
8. **Go beyond** to demonstrate excellence

The goal is not just working code, but **maintainable, testable, observable, production-ready software**.

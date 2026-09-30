CXX ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -Wpedantic
INCLUDES = -Iinclude

ifeq ($(OS),Windows_NT)
EXE_SUFFIX = .exe
CLEAN_COMMAND = cmd /c del /Q /F $(ENGINE) $(TESTS) 2>nul
else
EXE_SUFFIX =
CLEAN_COMMAND = rm -f $(ENGINE) $(TESTS)
endif

ENGINE = civicpulse-engine$(EXE_SUFFIX)
TESTS = civicpulse-tests$(EXE_SUFFIX)

.PHONY: all test clean

all: $(ENGINE)

$(ENGINE): src/main.cpp include/nlohmann/json.hpp
	$(CXX) $(CXXFLAGS) $(INCLUDES) src/main.cpp -o $(ENGINE)

$(TESTS): tests.cpp src/main.cpp include/nlohmann/json.hpp
	$(CXX) $(CXXFLAGS) $(INCLUDES) tests.cpp -o $(TESTS)

test: $(TESTS)
	./$(TESTS)

clean:
	-$(CLEAN_COMMAND)
# ...existing code from navigator_app/backend/Makefile...
# Compiler and flags
CXX = g++
CXXFLAGS = -std=c++17 -O3 -Wall -I./include -I../../TJ_RoutingKit/include

# Linker flags
# -L points to the directory with our library
# -lroutingkit links the library
# -Wl,-rpath embeds the library path so the executable can find it at runtime
# -pthread is required by httplib
LDFLAGS = -L../../TJ_RoutingKit/lib -lroutingkit -Wl,-rpath,../../TJ_RoutingKit/lib -pthread -lcrypto

# Source, object, and target files
SRC_SERVER = routing_server.cpp
OBJ_SERVER = $(SRC_SERVER:.cpp=.o)
TARGET_SERVER = routing_server

SRC_CLIENT = client.cpp
OBJ_CLIENT = $(SRC_CLIENT:.cpp=.o)
TARGET_CLIENT = client

SRC_TEST_CLIENT = test_client.cpp
OBJ_TEST_CLIENT = $(SRC_TEST_CLIENT:.cpp=.o)
TARGET_TEST_CLIENT = test_client

# Default target: only build the server by default
all: $(TARGET_SERVER)

# Rule to build the server executable
$(TARGET_SERVER): $(OBJ_SERVER)
	$(CXX) $(CXXFLAGS) -o $(TARGET_SERVER) $(OBJ_SERVER) $(LDFLAGS)


# (Optional) client/test targets omitted by default. Add them if sources are present.

# Rule to compile source files into object files
%.o: %.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

# Clean rule
clean:
	rm -f $(OBJ_SERVER) $(TARGET_SERVER)


cmake_minimum_required(VERSION 3.16)
project(civicpulse_engine LANGUAGES CXX)

add_executable(civicpulse-engine src/main.cpp)
target_compile_features(civicpulse-engine PRIVATE cxx_std_17)
set_target_properties(civicpulse-engine PROPERTIES CXX_EXTENSIONS OFF)
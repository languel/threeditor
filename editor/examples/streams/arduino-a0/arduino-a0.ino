/*
  A0 stream adapted from languel/p5comp, examples/legacy/ino/webserial-a0-circle.

  At 9600 baud:
    Editor -> HELLO
    Arduino -> READY
    Editor -> START
    Arduino -> OK START, then A0 <value> every 50 ms
*/

const unsigned long SAMPLE_INTERVAL_MS = 50;

bool streaming = false;
unsigned long lastSample = 0;
char commandBuffer[16];
size_t commandLength = 0;

void handleCommand() {
  commandBuffer[commandLength] = '\0';

  if (strcmp(commandBuffer, "HELLO") == 0) {
    Serial.println("READY");
  } else if (strcmp(commandBuffer, "START") == 0) {
    streaming = true;
    lastSample = millis() - SAMPLE_INTERVAL_MS;
    Serial.println("OK START");
  } else if (strcmp(commandBuffer, "STOP") == 0) {
    streaming = false;
    Serial.println("OK STOP");
  } else if (commandLength > 0) {
    Serial.println("ERR expected HELLO, START, or STOP");
  }

  commandLength = 0;
}

void setup() {
  Serial.begin(9600);
}

void loop() {
  while (Serial.available() > 0) {
    const char c = (char)Serial.read();
    if (c == '\n') {
      handleCommand();
    } else if (c != '\r' && commandLength < sizeof(commandBuffer) - 1) {
      commandBuffer[commandLength++] = c;
    }
  }

  const unsigned long now = millis();
  if (streaming && now - lastSample >= SAMPLE_INTERVAL_MS) {
    lastSample = now;
    Serial.print("A0 ");
    Serial.println(analogRead(A0));
  }
}

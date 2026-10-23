#pragma once

void openBrowser(HWND owner, const wchar_t *url);
int browserMonitorCommand(int count, wchar_t **arguments);
void positionBrowser(HWND owner);
BOOL testMonitorPlacement(HWND window);

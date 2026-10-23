#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <shlwapi.h>
#include <stdio.h>
#include <wchar.h>
#include "monitorBrowser.h"

#define MAX_MONITORS 32
#define POSITION_TIMER 1
#define MONITOR_SETTING L"Software\\LMU Lap Time Analyzer"

static MONITORINFOEXW monitors[MAX_MONITORS];
static UINT monitorCount;
static RECT target;
static RECT targetBounds;
static wchar_t browserPath[MAX_PATH];
static ULONGLONG deadline;
static HWND existingWindows[512];
static UINT existingWindowCount;
static wchar_t preferredMonitor[CCHDEVICENAME];
static HWND launchedWindow;
static ULONGLONG stableSince;
static ULONGLONG lastPlacementRequest;

static BOOL CALLBACK rememberWindow(HWND window, LPARAM data) {
    (void)data;
    if (existingWindowCount == ARRAYSIZE(existingWindows)) return FALSE;
    existingWindows[existingWindowCount++] = window;
    return TRUE;
}

static BOOL CALLBACK collectMonitor(HMONITOR monitor, HDC dc, LPRECT rect, LPARAM data) {
    (void)dc; (void)rect; (void)data;
    if (monitorCount == MAX_MONITORS) return FALSE;
    MONITORINFOEXW info = {0};
    info.cbSize = sizeof(info);
    if (GetMonitorInfoW(monitor, (MONITORINFO *)&info)) monitors[monitorCount++] = info;
    return TRUE;
}

static BOOL placeOnMonitor(HWND window, RECT work, RECT bounds, BOOL hidden) {
    WINDOWPLACEMENT placement = {0};
    placement.length = sizeof(placement);
    if (!GetWindowPlacement(window, &placement)) return FALSE;
    placement.flags = hidden ? 0 : WPF_ASYNCWINDOWPLACEMENT;
    placement.showCmd = hidden ? SW_HIDE : SW_SHOWMAXIMIZED;
    placement.ptMaxPosition.x = placement.ptMaxPosition.y = -1;
    placement.rcNormalPosition = work;
    // WINDOWPLACEMENT uses workspace coordinates for ordinary top-level windows.
    if (!(GetWindowLongPtrW(window, GWL_EXSTYLE) & WS_EX_TOOLWINDOW)) {
        OffsetRect(&placement.rcNormalPosition, bounds.left - work.left, bounds.top - work.top);
    }
    // Queue position and show state together. A separately queued SW_RESTORE can otherwise
    // arrive after our maximize check and shrink the browser again.
    return SetWindowPlacement(window, &placement);
}

static BOOL placementSettled(BOOL maximizedOnTarget, ULONGLONG now, ULONGLONG *since) {
    if (!maximizedOnTarget) { *since = 0; return FALSE; }
    if (!*since) *since = now;
    // Browser startup can restore its saved bounds after the first maximized frame.
    return now - *since >= 1000;
}

void positionBrowser(HWND owner) {
    HWND foreground = GetForegroundWindow();
    BOOL existing = FALSE;
    for (UINT i = 0; i < existingWindowCount; i++) {
        if (foreground == existingWindows[i]) existing = TRUE;
    }
    DWORD pid = 0;
    GetWindowThreadProcessId(foreground, &pid);
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    wchar_t executable[MAX_PATH];
    DWORD length = ARRAYSIZE(executable);
    BOOL matches = process && QueryFullProcessImageNameW(process, 0, executable, &length) &&
        _wcsicmp(executable, browserPath) == 0;
    if (process) CloseHandle(process);
    // Only the browser receiving the launch may move; never move LMU or an unrelated app.
    if (!existing && matches && IsWindowVisible(foreground)) {
        if (!launchedWindow) launchedWindow = foreground;
        if (foreground == launchedWindow) {
            ULONGLONG now = GetTickCount64();
            MONITORINFO info = {0};
            info.cbSize = sizeof(info);
            BOOL positioned = GetMonitorInfoW(MonitorFromWindow(foreground, MONITOR_DEFAULTTONEAREST), &info) &&
                EqualRect(&info.rcWork, &target) && IsZoomed(foreground);
            if (placementSettled(positioned, now, &stableSince)) {
                KillTimer(owner, POSITION_TIMER);
                return;
            }
            if (!positioned && now - lastPlacementRequest >= 250) {
                placeOnMonitor(foreground, target, targetBounds, FALSE);
                lastPlacementRequest = now;
            }
        }
    } else stableSince = 0;
    if (GetTickCount64() >= deadline) {
        KillTimer(owner, POSITION_TIMER);
        MessageBoxW(owner, L"The browser opened, but maximized placement could not be confirmed. Move it to the chosen monitor and maximize it.",
            L"LMU Lap Time Analyzer", MB_OK | MB_ICONINFORMATION);
    }
}

static void openOnMonitor(HWND owner, const wchar_t *url, UINT index) {
    KillTimer(owner, POSITION_TIMER);
    DWORD length = ARRAYSIZE(browserPath);
    const wchar_t *protocol = wcsncmp(url, L"https:", 6) == 0 ? L"https" : L"http";
    HRESULT result = AssocQueryStringW(ASSOCF_IS_PROTOCOL, ASSOCSTR_EXECUTABLE,
        protocol, L"open", browserPath, &length);
    const wchar_t *name = PathFindFileNameW(browserPath);
    if (result != S_OK || (_wcsicmp(name, L"msedge.exe") != 0 &&
        _wcsicmp(name, L"chrome.exe") != 0 && _wcsicmp(name, L"firefox.exe") != 0 &&
        _wcsicmp(name, L"brave.exe") != 0 && _wcsicmp(name, L"vivaldi.exe") != 0)) {
        ShellExecuteW(owner, L"open", url, NULL, NULL, SW_SHOWNORMAL);
        MessageBoxW(owner, L"The browser opened using its default placement. Monitor selection supports Edge, Chrome, Firefox, Brave and Vivaldi.",
            L"LMU Lap Time Analyzer", MB_OK | MB_ICONINFORMATION);
        return;
    }
    // A new window avoids moving the user's existing tabs onto another display.
    // URLs are supplied by the server; reject quotes before building a browser command line.
    if (wcschr(url, L'"')) return;
    wchar_t parameters[4096];
    if (swprintf_s(parameters, ARRAYSIZE(parameters), L"--new-window \"%s\"", url) < 0) return;
    existingWindowCount = 0;
    if (!EnumWindows(rememberWindow, 0)) {
        MessageBoxW(owner, L"Unable to identify existing browser windows. Select Browser default in the app's Settings and try again.",
            L"LMU Lap Time Analyzer", MB_OK | MB_ICONINFORMATION);
        return;
    }
    HINSTANCE launched = ShellExecuteW(owner, L"open", browserPath, parameters, NULL, SW_SHOWNORMAL);
    if ((INT_PTR)launched <= 32) {
        MessageBoxW(owner, L"Unable to open the browser.", L"LMU Lap Time Analyzer", MB_OK | MB_ICONERROR);
        return;
    }
    target = monitors[index].rcWork;
    targetBounds = monitors[index].rcMonitor;
    launchedWindow = NULL;
    stableSince = lastPlacementRequest = 0;
    deadline = GetTickCount64() + 10000;
    SetTimer(owner, POSITION_TIMER, 100, NULL);
}

static void readMonitors(void) {
    monitorCount = 0;
    EnumDisplayMonitors(NULL, NULL, collectMonitor, 0);
    DWORD settingSize = sizeof(preferredMonitor);
    preferredMonitor[0] = L'\0';
    if (RegGetValueW(HKEY_CURRENT_USER, MONITOR_SETTING, L"BrowserMonitor", RRF_RT_REG_SZ,
        NULL, preferredMonitor, &settingSize) != ERROR_SUCCESS) preferredMonitor[0] = L'\0';
}

void openBrowser(HWND owner, const wchar_t *url) {
    KillTimer(owner, POSITION_TIMER);
    readMonitors();
    for (UINT i = 0; i < monitorCount; i++) {
        if (wcscmp(monitors[i].szDevice, preferredMonitor) == 0) {
            openOnMonitor(owner, url, i);
            return;
        }
    }
    // An unplugged preferred display falls back to the browser's normal placement.
    ShellExecuteW(owner, L"open", url, NULL, NULL, SW_SHOWNORMAL);
}

int browserMonitorCommand(int count, wchar_t **arguments) {
    readMonitors();
    if (wcscmp(arguments[1], L"--list-monitors") == 0 && count == 2) {
        // Device names are ASCII Windows identifiers. TSV avoids locale-dependent display names.
        printf("%ls\n", preferredMonitor);
        for (UINT i = 0; i < monitorCount; i++) {
            MONITORINFOEXW *info = &monitors[i];
            printf("%ls\t%ld\t%ld\t%d\n", info->szDevice,
                info->rcMonitor.right - info->rcMonitor.left, info->rcMonitor.bottom - info->rcMonitor.top,
                (info->dwFlags & MONITORINFOF_PRIMARY) != 0);
        }
        return 0;
    }
    if (wcscmp(arguments[1], L"--set-monitor") != 0 || count != 3) return 1;
    const wchar_t *device = arguments[2];
    BOOL valid = device[0] == L'\0';
    for (UINT i = 0; i < monitorCount; i++) {
        if (wcscmp(monitors[i].szDevice, device) == 0) valid = TRUE;
    }
    if (!valid) return 1;
    return RegSetKeyValueW(HKEY_CURRENT_USER, MONITOR_SETTING, L"BrowserMonitor", REG_SZ,
        device, (DWORD)((wcslen(device) + 1) * sizeof(wchar_t))) == ERROR_SUCCESS ? 0 : 1;
}

BOOL testMonitorPlacement(HWND window) {
    ULONGLONG since = 0;
    // Reproduce a browser that first maximizes, restores saved bounds, then maximizes again.
    if (placementSettled(TRUE, 100, &since) || placementSettled(TRUE, 900, &since) ||
        placementSettled(FALSE, 950, &since) || since != 0 ||
        placementSettled(TRUE, 1000, &since) || placementSettled(TRUE, 1900, &since) ||
        !placementSettled(TRUE, 2000, &since)) return FALSE;
    monitorCount = 0;
    EnumDisplayMonitors(NULL, NULL, collectMonitor, 0);
    if (!monitorCount) return FALSE;
    for (UINT i = 0; i < monitorCount; i++) {
        RECT actual;
        RECT work = monitors[i].rcWork;
        if (!placeOnMonitor(window, work, monitors[i].rcMonitor, TRUE) || !GetWindowRect(window, &actual) ||
            !EqualRect(&actual, &work))
            return FALSE;
    }
    return TRUE;
}

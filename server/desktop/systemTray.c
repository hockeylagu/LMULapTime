#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <stdio.h>
#include <wchar.h>

#define TRAY_EVENT (WM_APP + 1)
#define SERVER_EXIT (WM_APP + 2)
#define OPEN_WEBSITE 1

static NOTIFYICONDATAW tray;
static const wchar_t *website;
static UINT taskbarCreated;
static BOOL hidden;

static void openWebsite(HWND window) {
    ShellExecuteW(window, L"open", website, NULL, NULL, SW_SHOWNORMAL);
}

static BOOL addTray(void) {
    if (hidden) return TRUE;
    if (!Shell_NotifyIconW(NIM_ADD, &tray)) return FALSE;
    tray.uVersion = NOTIFYICON_VERSION_4;
    return Shell_NotifyIconW(NIM_SETVERSION, &tray);
}

static LRESULT CALLBACK windowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    if (message == taskbarCreated) {
        addTray();
        return 0;
    }
    switch (message) {
    case TRAY_EVENT:
        switch (LOWORD(lParam)) {
        case WM_LBUTTONDBLCLK:
        case NIN_KEYSELECT:
            openWebsite(window);
            break;
        case WM_CONTEXTMENU: {
            POINT cursor;
            HMENU menu = CreatePopupMenu();
            GetCursorPos(&cursor);
            AppendMenuW(menu, MF_STRING, OPEN_WEBSITE, L"Open LMU Lap Time Analyzer");
            SetForegroundWindow(window);
            UINT selected = TrackPopupMenu(menu, TPM_RETURNCMD | TPM_RIGHTBUTTON,
                cursor.x, cursor.y, 0, window, NULL);
            if (selected == OPEN_WEBSITE) openWebsite(window);
            PostMessageW(window, WM_NULL, 0, 0);
            DestroyMenu(menu);
            break;
        }
        }
        return 0;
    case SERVER_EXIT:
        DestroyWindow(window);
        return 0;
    case WM_DESTROY:
        if (!hidden) Shell_NotifyIconW(NIM_DELETE, &tray);
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProcW(window, message, wParam, lParam);
}

static DWORD WINAPI waitForServer(LPVOID parameter) {
    HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
    char buffer[64];
    DWORD bytes;
    while (ReadFile(input, buffer, sizeof(buffer), &bytes, NULL) && bytes != 0) { }
    PostMessageW((HWND)parameter, SERVER_EXIT, 0, 0);
    return 0;
}

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE previous, PWSTR command, int show) {
    (void)previous; (void)command; (void)show;
    int count;
    wchar_t **arguments = CommandLineToArgvW(GetCommandLineW(), &count);
    if (!arguments) return 1;
    if (count < 2 || (wcsncmp(arguments[1], L"http://", 7) != 0 &&
        wcsncmp(arguments[1], L"https://", 8) != 0)) {
        fputs("Expected an HTTP or HTTPS website URL.\n", stderr);
        LocalFree(arguments);
        return 1;
    }
    website = arguments[1];
    // Native integration tests exercise the message loop without displaying an icon.
    hidden = count == 3 && wcscmp(arguments[2], L"--hidden") == 0;
    taskbarCreated = RegisterWindowMessageW(L"TaskbarCreated");
    WNDCLASSW windowClass = {0};
    windowClass.lpfnWndProc = windowProc;
    windowClass.hInstance = instance;
    windowClass.lpszClassName = L"LmuLapTimeTray";
    if (!RegisterClassW(&windowClass)) {
        LocalFree(arguments);
        return 1;
    }
    // A hidden top-level window also receives TaskbarCreated after Explorer restarts.
    HWND window = CreateWindowExW(0, windowClass.lpszClassName, L"", WS_OVERLAPPED,
        0, 0, 0, 0, NULL, NULL, instance, NULL);
    if (!window) {
        LocalFree(arguments);
        return 1;
    }
    tray.cbSize = sizeof(tray);
    tray.hWnd = window;
    tray.uID = 1;
    tray.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP | NIF_SHOWTIP;
    tray.uCallbackMessage = TRAY_EVENT;
    tray.hIcon = LoadIconW(instance, MAKEINTRESOURCEW(1));
    wcscpy_s(tray.szTip, ARRAYSIZE(tray.szTip), L"LMU Lap Time Analyzer");
    if (!tray.hIcon || !addTray()) {
        fputs("Unable to create the notification icon.\n", stderr);
        DestroyWindow(window);
        LocalFree(arguments);
        return 1;
    }
    HANDLE reader = CreateThread(NULL, 0, waitForServer, window, 0, NULL);
    if (!reader) {
        DestroyWindow(window);
        LocalFree(arguments);
        return 1;
    }
    CloseHandle(reader);
    fputs("tray-ready\n", stdout);
    fflush(stdout);
    MSG message;
    int result;
    while ((result = (int)GetMessageW(&message, NULL, 0, 0)) > 0) {
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }
    if (result < 0) DestroyWindow(window);
    LocalFree(arguments);
    return result < 0 ? 1 : 0;
}

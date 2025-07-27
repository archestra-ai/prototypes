## Debugging Tauri with Zed

1. **Start the app**  
   ```sh
   pnpm tauri dev
   ```

2. **Get the PID**  
   ```sh
   ps aux | grep target/debug/arechestra-ai | awk '{print $2}'
   ```

3. **Open Zed Debug Panel**  
   Press `Cmd + J`

4. **Attach to the PID**  
   Use the PID from step 2

5. **Select the debugger**  
   Choose `CodeLLDB`

6. ✅ Done

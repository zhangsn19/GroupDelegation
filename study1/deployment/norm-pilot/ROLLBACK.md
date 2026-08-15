# Rollback instructions

The final deployment script records the previous unit, private environment, Nginx file, release path, service state, and checksums under the timestamped backup directory printed by the script.

If final acceptance fails, run the generated `rollback.sh` from that backup directory as root. It restores only:

- `group-deception-study1-ai-norm-pilot.service`
- `/etc/group-deception/study1-ai-norm-pilot-v1.env`
- the Norm Pilot Nginx server block
- the previous Norm Pilot release working directory

It then runs `systemctl daemon-reload`, restarts only the Norm Pilot 5002 unit, validates Nginx, and reloads Nginx. It does not modify or restart ports 5001, 5003, 5004, or 5005.

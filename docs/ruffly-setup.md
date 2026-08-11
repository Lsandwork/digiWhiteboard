# Ruffly Setup Wizard

Open `https://staff.ruffops.com/ruffly?page=settings` as Super Admin.

Steps (tracked on `ruffly_settings.setup_step`; UI shows a 20-step list):
1. Business profile
2. Locations
3. Connect/test Gingr
4. Register Gingr webhook — **keep DigiBoard URL**  
   `https://staff.ruffops.com/api/gingr/webhook`  
   Gingr allows only one webhook; DigiBoard fans events into Ruffly. Do not switch Gingr to `/api/ruffly/webhooks/gingr`.
5. Initial contact sync
6. SMS / email providers
7. Consent wording
8. Review destinations
9. Web chat install
10. Knowledge import
11. AI tone
12. Permissions
13. Review automation templates (leave draft)
14. Test SMS/email/webchat
15. Launch (`setup_completed=true`) and enable sending channels explicitly

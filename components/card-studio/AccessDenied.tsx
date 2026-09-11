export function AccessDenied() {
  return (
    <div className="cs-forbidden admin-theme">
      <div>
        <p className="cs-status" style={{ color: "#fb7185", justifyContent: "center" }}>
          403
        </p>
        <h1>Access denied</h1>
        <p>Card Studio is limited to Admin and Marketing accounts. This request was not redirected away — you do not have permission to use this product.</p>
      </div>
    </div>
  );
}

import React from 'react';

const Footer = () => {
  return (
    <footer style={{ textAlign: 'center', padding: '1rem', marginTop: '2rem', borderTop: '1px solid #ccc' }}>
      <p>&copy; {new Date().getFullYear()} Cafe Management System. All rights reserved.</p>
    </footer>
  );
};

export default Footer;
